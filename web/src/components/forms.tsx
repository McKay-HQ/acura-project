// Add/edit forms for parts, containers and tossed records. Existing photos can be
// reordered or deleted in place; new photos upload when the form is saved.
import { useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { api, errorMessage, CONFLICT_MESSAGE, PreconditionFailedError, type Resource } from '../api';
import { PhotoEditor, FormButtons } from './ui';
import { BOX_ICONS, isBoxIcon } from './Icons';
import { STATUSES, FITS, SUGGESTED_TAGS, parseTags, topContainers, subContainers, isStatus } from '../constants';
import type {
    Container,
    ContainerIcon,
    ContainerInput,
    OnSaved,
    Part,
    PartInput,
    PartStatus,
    Tossed,
    TossedInput,
} from '../types';

type FieldEvent = ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
/** Keys of a form's state that a text input can write to (the field accepts a string). */
type TextKeys<F> = { [K in keyof F]-?: string extends F[K] ? K : never }[keyof F];
/** A record with photos: part, container or tossed item. */
type WithPhotos = Part | Container | Tossed;

const num = (v: string | number | null | undefined): number | null => (v === '' || v == null ? null : Number(v));

/** Shown in a form after a 412; the form keeps the typed values and now holds the current version. */
export const CONFLICT_IN_FORM = `${CONFLICT_MESSAGE} Your edits are still here: check them and save again to apply them.`;
export const clashText = (labels: string[]) =>
    labels.length ? ` Also changed by someone else: ${labels.join(', ')}.` : '';

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
// Cast: Object.keys of a fully-keyed object lists exactly that object's keys.
const keysOf = <O extends object>(o: O) => Object.keys(o) as (keyof O & string)[];

export interface EditFields<F, I> {
    f: F;
    setF: Dispatch<SetStateAction<F>>;
    /** Every field as request-body values (for creating a record). */
    input: () => I;
    changes: () => Partial<I>;
    rebase: (next: F) => string[];
}

/**
 * A form's values (`f`) and the record values it started from (the snapshot). For an existing
 * record only the fields the user changed are sent, so a save never writes back stale values of
 * fields the user didn't touch. `toInput` maps the form values to the request body, key for key;
 * values are compared after that mapping (so "5" and 5 are the same price).
 */
export function useEditFields<F extends object, I extends { [K in keyof F]: unknown }>(
    initial: F,
    toInput: (f: F) => I,
    labels: { [K in keyof F]: string },
): EditFields<F, I> {
    const [f, setF] = useState<F>(initial);
    const [base, setBase] = useState<F>(initial);
    /** The fields changed since the snapshot, as request-body values. */
    const changes = (): Partial<I> => {
        const now = toInput(f);
        const was = toInput(base);
        const out: Partial<I> = {};
        for (const k of keysOf(labels)) if (!sameValue(now[k], was[k])) out[k] = now[k];
        return out;
    };
    /**
     * Moves the form onto a newer version of the record: fields the user hasn't changed take the
     * new values, changed ones keep what was typed. Returns the labels of fields the user changed
     * that the other person also changed, to something different.
     */
    const rebase = (next: F): string[] => {
        const now = toInput(f);
        const was = toInput(base);
        const then = toInput(next);
        const clashes = keysOf(labels)
            .filter((k) => !sameValue(now[k], was[k]) && !sameValue(then[k], was[k]) && !sameValue(then[k], now[k]))
            .map((k) => labels[k]);
        setF((cur) => {
            const merged = { ...cur };
            const curIn = toInput(cur);
            for (const k of keysOf(labels)) if (sameValue(curIn[k], was[k])) merged[k] = next[k];
            return merged;
        });
        setBase(next);
        return clashes;
    };
    return { f, setF, input: () => toInput(f), changes, rebase };
}

/**
 * Save + photo edits for a part, container or tossed form. `rec` is the record as of this form's
 * last write: every write sends its version and the response replaces it, so a later write
 * (photo edits, then Save) carries the new version. It is not refreshed from the lists, so
 * someone else's change in the meantime gets a 412, and the form then rebases onto `current`.
 */
function useSubmit<T extends WithPhotos, RI, F extends object, I extends RI & { [K in keyof F]: unknown }>(
    resource: Resource<T, RI>,
    record: T | undefined,
    onSaved: OnSaved<T>,
    edit: EditFields<F, I>,
    fromRecord: (r: T) => F,
) {
    const [rec, setRec] = useState<T | undefined>(record);
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    /** Takes a newer version of the record into the form; returns the clash note, if any. */
    const adopt = (r: T): string => {
        setRec(r);
        return clashText(edit.rebase(fromRecord(r)));
    };
    /** Message for a failed write; a 412 also rebases the form onto the current record. */
    const failure = (err: unknown, r: T | undefined): string => {
        if (!(err instanceof PreconditionFailedError)) return errorMessage(err);
        const current = r && err.currentFor(r);
        return CONFLICT_IN_FORM + (current ? adopt(current) : '');
    };
    async function save() {
        setBusy(true);
        setError('');
        let current = rec;
        try {
            let saved: T;
            if (current) {
                const body = edit.changes();
                if (Object.keys(body).length) {
                    current = await resource.update(current, body);
                    setRec(current);
                }
                saved = files.length ? await resource.addPhotos(current, files) : current;
            } else {
                saved = await resource.create(edit.input(), files);
            }
            onSaved(saved);
        } catch (err) {
            setError(failure(err, current));
            setBusy(false);
        }
    }
    const photoEdit = async (fn: (r: T) => Promise<T>) => {
        if (!rec) return;
        setError('');
        try {
            const updated = await fn(rec);
            // The response may carry someone else's field changes too; take them into the form.
            setError(adopt(updated).trim());
            onSaved(updated, { keepOpen: true });
        } catch (err) {
            setError(failure(err, rec));
        }
    };
    const photos = rec?.photos || [];
    const editor = rec && (
        <PhotoEditor
            photos={photos}
            onMakeMain={(p) =>
                photoEdit((r) =>
                    resource.reorderPhotos(r, [p.id, ...photos.filter((x) => x.id !== p.id).map((x) => x.id)]),
                )
            }
            onDelete={(p) => photoEdit((r) => resource.deletePhoto(r, p.id))}
        />
    );
    const fileInput = (
        <label>
            {record ? 'Add photos' : 'Photos'}
            <input type="file" accept="image/*" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        </label>
    );
    const buttons = (onCancel: () => void) => (
        <>
            {error && (
                <p className="err" role="alert">
                    {error}
                </p>
            )}
            <FormButtons onCancel={onCancel} busy={busy} />
        </>
    );
    return { save, fileInput, buttons, editor };
}

interface PartFields {
    label: string;
    partNumber: string;
    status: PartStatus;
    fits: string;
    /** Comma-separated. */
    tags: string;
    /** A number from the record, or the input's string once edited. */
    valueLow: number | string;
    valueHigh: number | string;
    containerId: string;
    notes: string;
}

const partFields = (part?: Part): PartFields => ({
    label: part?.label || '',
    partNumber: part?.partNumber || '',
    status: part?.status || 'Unverified',
    fits: part?.fits || '',
    tags: (part?.tags || []).join(', '),
    valueLow: part?.valueLow ?? '',
    valueHigh: part?.valueHigh ?? '',
    containerId: part?.container?.id || '',
    notes: part?.notes || '',
});
const partInput = (f: PartFields): PartInput => ({
    label: f.label,
    partNumber: f.partNumber,
    status: f.status,
    fits: f.fits,
    tags: parseTags(f.tags),
    valueLow: num(f.valueLow),
    valueHigh: num(f.valueHigh),
    containerId: f.containerId || null,
    notes: f.notes,
});
const PART_LABELS: Record<keyof PartFields, string> = {
    label: 'Name',
    partNumber: 'Part number',
    status: 'Status',
    fits: 'Fits',
    tags: 'Tags',
    valueLow: 'Value (low)',
    valueHigh: 'Value (high)',
    containerId: 'Container',
    notes: 'Notes',
};

interface PartFormProps {
    part?: Part;
    containers: Container[];
    tagOptions: string[];
    onSaved: OnSaved<Part>;
    onCancel: () => void;
}

export function PartForm({ part, containers, tagOptions, onSaved, onCancel }: PartFormProps) {
    const edit = useEditFields(partFields(part), partInput, PART_LABELS);
    const { f, setF } = edit;
    const set = (k: TextKeys<PartFields>) => (e: FieldEvent) => setF({ ...f, [k]: e.target.value });
    const { save, fileInput, buttons, editor } = useSubmit(api.parts, part, onSaved, edit, partFields);
    const tagList = [...new Set([...SUGGESTED_TAGS, ...(tagOptions || [])])];

    const submit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        save();
    };

    return (
        <form onSubmit={submit}>
            <h3 id="form-title">{part ? 'Edit part' : 'Add part'}</h3>
            <label>
                Name
                <input
                    value={f.label}
                    onChange={set('label')}
                    required
                    maxLength={200}
                    placeholder="e.g. Cruise control actuator"
                    autoFocus
                />
            </label>
            <label>
                Part number / markings
                <input value={f.partNumber} onChange={set('partNumber')} maxLength={300} placeholder="e.g. 73162-S6M" />
            </label>
            <div className="row">
                <label>
                    Status
                    <select
                        value={f.status}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (isStatus(v)) setF({ ...f, status: v });
                        }}
                    >
                        {STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Fits
                    <input
                        value={f.fits}
                        onChange={set('fits')}
                        list="fits-list"
                        maxLength={60}
                        placeholder="e.g. RSX, S2000"
                    />
                    <datalist id="fits-list">
                        {FITS.map((c) => (
                            <option key={c} value={c} />
                        ))}
                    </datalist>
                </label>
            </div>
            <label>
                Tags
                <input
                    value={f.tags}
                    onChange={set('tags')}
                    list="tags-list"
                    maxLength={400}
                    placeholder="Comma-separated, e.g. Body & trim, Spare, For sale"
                />
                <datalist id="tags-list">
                    {tagList.map((t) => (
                        <option key={t} value={t} />
                    ))}
                </datalist>
            </label>
            <div className="row">
                <label>
                    Value, low ($)
                    <input
                        type="number"
                        min="0"
                        step="5"
                        inputMode="decimal"
                        value={f.valueLow}
                        onChange={set('valueLow')}
                    />
                </label>
                <label>
                    Value, high ($)
                    <input
                        type="number"
                        min="0"
                        step="5"
                        inputMode="decimal"
                        value={f.valueHigh}
                        onChange={set('valueHigh')}
                    />
                </label>
            </div>
            <label>
                Container
                <select value={f.containerId} onChange={set('containerId')}>
                    <option value="">No container</option>
                    {topContainers(containers || []).map((b) => {
                        const subs = subContainers(containers, b.id);
                        return subs.length ? (
                            <optgroup key={b.id} label={b.name}>
                                <option value={b.id}>{b.name} (not in a sub-container)</option>
                                {subs.map((x) => (
                                    <option key={x.id} value={x.id}>
                                        {x.name}
                                    </option>
                                ))}
                            </optgroup>
                        ) : (
                            <option key={b.id} value={b.id}>
                                {b.name}
                            </option>
                        );
                    })}
                </select>
            </label>
            <label>
                Notes
                <textarea rows={4} value={f.notes} onChange={set('notes')} />
            </label>
            {editor}
            {fileInput}
            {buttons(onCancel)}
        </form>
    );
}

interface ContainerFields {
    name: string;
    location: string;
    notes: string;
    /** '' for a top-level container. */
    parentId: string;
    icon: ContainerIcon;
}

const containerFields = (container?: Container): ContainerFields => ({
    name: container?.name || '',
    location: container?.location || '',
    notes: container?.notes || '',
    parentId: container?.parentId || '',
    icon: container?.icon || 'box',
});
const containerInput = (f: ContainerFields): Required<ContainerInput> => ({ ...f, parentId: f.parentId || null });
const CONTAINER_LABELS: Record<keyof ContainerFields, string> = {
    name: 'Name',
    location: 'Location',
    notes: 'Notes',
    parentId: 'Inside',
    icon: 'Icon',
};

interface ContainerFormProps {
    container?: Container;
    containers?: Container[];
    onSaved: OnSaved<Container>;
    onCancel: () => void;
}

export function ContainerForm({ container, containers = [], onSaved, onCancel }: ContainerFormProps) {
    const edit = useEditFields(containerFields(container), containerInput, CONTAINER_LABELS);
    const { f, setF } = edit;
    const hasSubs = container !== undefined && subContainers(containers, container.id).length > 0;
    const parents = topContainers(containers).filter((b) => b.id !== container?.id);
    const set = (k: TextKeys<ContainerFields>) => (e: FieldEvent) => setF({ ...f, [k]: e.target.value });
    const { save, fileInput, buttons, editor } = useSubmit(api.containers, container, onSaved, edit, containerFields);
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                // A container with sub-containers can't move (its Inside select is disabled), so its
                // parentId never counts as changed and isn't sent.
                save();
            }}
        >
            <h3 id="form-title">{container ? 'Edit container' : 'Add container'}</h3>
            <label>
                Name
                <input
                    value={f.name}
                    onChange={set('name')}
                    required
                    maxLength={120}
                    placeholder="e.g. Gray bin 1"
                    autoFocus
                />
            </label>
            <label>
                Location
                <input
                    value={f.location}
                    onChange={set('location')}
                    maxLength={200}
                    placeholder="e.g. Garage shelf, top"
                />
            </label>
            <div className="row">
                <label>
                    Inside
                    <select value={f.parentId} onChange={set('parentId')} disabled={hasSubs}>
                        <option value="">Nothing (top-level container)</option>
                        {parents.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Icon
                    <select
                        value={f.icon}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (isBoxIcon(v)) setF({ ...f, icon: v });
                        }}
                    >
                        {Object.entries(BOX_ICONS).map(([k, [name]]) => (
                            <option key={k} value={k}>
                                {name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <label>
                Notes
                <textarea rows={4} value={f.notes} onChange={set('notes')} />
            </label>
            {editor}
            {fileInput}
            {buttons(onCancel)}
        </form>
    );
}

interface TossedFields {
    label: string;
    partNumber: string;
    reason: string;
    /** 'YYYY-MM-DD', or '' for no date. */
    tossedOn: string;
}

const tossedFields = (item?: Tossed): TossedFields => ({
    label: item?.label || '',
    partNumber: item?.partNumber || '',
    reason: item?.reason || '',
    tossedOn: item?.tossedOn || new Date().toLocaleDateString('en-CA'),
});
const tossedInput = (f: TossedFields): TossedInput => ({ ...f, tossedOn: f.tossedOn || null });
const TOSSED_LABELS: Record<keyof TossedFields, string> = {
    label: 'Name',
    partNumber: 'Part number',
    reason: 'Why it was tossed',
    tossedOn: 'Date tossed',
};

interface TossedFormProps {
    item?: Tossed;
    onSaved: OnSaved<Tossed>;
    onCancel: () => void;
}

export function TossedForm({ item, onSaved, onCancel }: TossedFormProps) {
    const edit = useEditFields(tossedFields(item), tossedInput, TOSSED_LABELS);
    const { f, setF } = edit;
    const set = (k: TextKeys<TossedFields>) => (e: FieldEvent) => setF({ ...f, [k]: e.target.value });
    const { save, fileInput, buttons, editor } = useSubmit(api.tossed, item, onSaved, edit, tossedFields);
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                save();
            }}
        >
            <h3 id="form-title">{item ? 'Edit tossed item' : 'Log a tossed item'}</h3>
            <label>
                Name
                <input value={f.label} onChange={set('label')} required maxLength={200} autoFocus />
            </label>
            <label>
                Part number / markings
                <input value={f.partNumber} onChange={set('partNumber')} maxLength={300} />
            </label>
            <label>
                Why it was tossed
                <textarea rows={3} value={f.reason} onChange={set('reason')} />
            </label>
            <label>
                Date tossed
                <input type="date" value={f.tossedOn} onChange={set('tossedOn')} />
            </label>
            {editor}
            {fileInput}
            {buttons(onCancel)}
        </form>
    );
}

/** Small form shown when tossing a part from the Parts tab. */
interface TossPartFormProps {
    part: Part;
    onDone: (tossed: Tossed) => void;
    onCancel: () => void;
}

export function TossPartForm({ part, onDone, onCancel }: TossPartFormProps) {
    const [reason, setReason] = useState<string>('');
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [rec, setRec] = useState<Part>(part);
    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setBusy(true);
        try {
            onDone(await api.parts.toss(rec, { reason }));
        } catch (err) {
            if (err instanceof PreconditionFailedError) {
                const current = err.currentFor(rec);
                if (current) setRec(current);
                setError(`${CONFLICT_MESSAGE} Check it and toss it again if you still want to.`);
            } else {
                setError(errorMessage(err));
            }
            setBusy(false);
        }
    };
    return (
        <form onSubmit={submit}>
            <h3 id="form-title">Toss “{part.label}”</h3>
            <p className="mini" style={{ margin: 0 }}>
                It moves to the Tossed tab with its photos, so there's a record if something turns up missing later.
            </p>
            <label>
                Why
                <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Wrong model (SR3 Civic)"
                    autoFocus
                />
            </label>
            {error && (
                <p className="err" role="alert">
                    {error}
                </p>
            )}
            <FormButtons onCancel={onCancel} busy={busy} saveLabel="Toss it" danger />
        </form>
    );
}
