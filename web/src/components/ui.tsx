// Small shared pieces: status badge, clickable tag pills, container link, icon action rows,
// form buttons and the photo editor.
import { createContext, useContext, useState, type MouseEvent, type ReactNode } from 'react';
import { Icon, BoxIcon } from './Icons';
import { statusClass, isForSale, isOtherCar, phaseTags, FOR_SALE, href } from '../constants';
import type { ContainerRef, FilterKey, Part, Photo } from '../types';

/** Shows only parts matching one filter key, e.g. "tag:Spare". */
export type TagFilterFn = (key: FilterKey) => void;

/** Clicking any tag shows only parts with that tag. Provided by the app. */
export const TagFilter = createContext<TagFilterFn>(() => {});
const useTagFilter = (): TagFilterFn => useContext(TagFilter);

type StatusPart = Pick<Part, 'status' | 'tags'>;
interface StatusInfo {
    text: string;
    key: FilterKey;
    cls: string;
    icon: ReactNode;
}

const statusOf = (part: StatusPart): StatusInfo => {
    const sale = isForSale(part);
    return {
        text: sale ? 'For sale' : part.status,
        key: sale ? `tag:${FOR_SALE}` : `st:${part.status}`,
        cls: sale ? 'st-sale' : statusClass(part.status),
        icon: sale ? <Icon.dollar /> : part.status === 'Unknown' ? <Icon.question /> : <Icon.check />,
    };
};

/** Status (or For sale) badge. Clicking it filters on that status. */
export function StatusBadge({ part, iconOnly }: { part: StatusPart; iconOnly?: boolean }) {
    const onTag = useTagFilter();
    const s = statusOf(part);
    const click = (e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        onTag(s.key);
    };
    if (iconOnly) {
        return (
            <button
                type="button"
                className={`sicon ${s.cls}`}
                title={`Show only ${s.text}`}
                aria-label={`${s.text}: show only these`}
                onClick={click}
            >
                {s.icon}
            </button>
        );
    }
    return (
        <button type="button" className={`pill withicon ${s.cls}`} title={`Show only ${s.text}`} onClick={click}>
            {s.icon}
            {s.text}
        </button>
    );
}

/** Non-interactive status icon, for use inside links. */
export function StatusIcon({ part }: { part: StatusPart }) {
    const s = statusOf(part);
    return (
        <span className={`sicon ${s.cls}`} title={s.text} role="img" aria-label={s.text}>
            {s.icon}
        </span>
    );
}

export function FitsPill({ fits }: { fits: string | null | undefined }) {
    const onTag = useTagFilter();
    if (!fits) return null;
    return (
        <button
            type="button"
            className={`pill fits ${isOtherCar(fits) ? 'other' : 'rsx'}`}
            title={`Show only parts that fit ${fits}`}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTag(`fits:${fits}`);
            }}
        >
            {fits}
        </button>
    );
}

/** Phase tags (from open tasks) then the part's own tags. "For sale" shows as the status badge instead. */
export function TagPills({ part }: { part: Pick<Part, 'tags' | 'phaseTags'> }) {
    const onTag = useTagFilter();
    const list: [tag: string, cls: string][] = [
        ...phaseTags(part).map((t): [string, string] => [t, 'utag phase']),
        ...(part.tags || []).filter((t) => t !== FOR_SALE).map((t): [string, string] => [t, 'utag']),
    ];
    return list.map(([t, cls]) => (
        <button
            type="button"
            key={t}
            className={`pill ${cls}`}
            title={`Show only ${t}`}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTag(`tag:${t}`);
            }}
        >
            {t}
        </button>
    ));
}

/** The part's container name (a sub-container shows its own name), linking to the top-level container's page. */
export function BoxLink({ container }: { container: ContainerRef | null }) {
    if (!container) return null;
    const top = container.top || container;
    return (
        <a
            className="boxlink"
            href={href.box(top)}
            title={top.id !== container.id ? `Container: ${top.name}` : 'Container'}
            onClick={(e) => e.stopPropagation()}
        >
            <BoxIcon icon={top.icon} />
            {container.name}
        </a>
    );
}

/** Icon buttons with an inline confirmation before deleting. */
export interface ExtraAction {
    label: string;
    icon: ReactNode;
    cls?: string;
    onClick: () => void;
}

interface RowActionsProps {
    inTable?: boolean;
    onEdit?: () => void;
    extra?: ExtraAction[];
    onDelete?: () => void;
    deleteLabel?: string;
    confirmText?: string;
    className?: string;
}

export function RowActions({
    inTable,
    onEdit,
    extra = [],
    onDelete,
    deleteLabel = 'Remove',
    confirmText = 'Remove?',
    className,
}: RowActionsProps) {
    const [confirming, setConfirming] = useState<boolean>(false);
    const cls = className || (inTable ? 'rowacts' : 'actions');
    const stop = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        fn();
    };
    if (confirming) {
        return (
            <div className={`${inTable ? 'rowacts ' : ''}confirm`} onClick={(e) => e.stopPropagation()}>
                <span>{confirmText}</span>
                <button
                    type="button"
                    className="ibtn danger"
                    title={deleteLabel}
                    aria-label={deleteLabel}
                    onClick={() => {
                        setConfirming(false);
                        onDelete?.();
                    }}
                >
                    <Icon.trash />
                </button>
                <button
                    type="button"
                    className="ibtn"
                    title="Cancel"
                    aria-label="Cancel"
                    onClick={() => setConfirming(false)}
                >
                    <Icon.x />
                </button>
            </div>
        );
    }
    return (
        <div className={cls}>
            {onEdit && (
                <button type="button" className="ibtn" title="Edit" aria-label="Edit" onClick={stop(onEdit)}>
                    <Icon.edit />
                </button>
            )}
            {extra.map((b) => (
                <button
                    type="button"
                    key={b.label}
                    className={`ibtn ${b.cls || ''}`}
                    title={b.label}
                    aria-label={b.label}
                    onClick={stop(b.onClick)}
                >
                    {b.icon}
                </button>
            ))}
            {onDelete && (
                <button
                    type="button"
                    className="ibtn del"
                    title={deleteLabel}
                    aria-label={deleteLabel}
                    onClick={stop(() => setConfirming(true))}
                >
                    <Icon.trash />
                </button>
            )}
        </div>
    );
}

/** Save / cancel icons at the bottom of a form. */
interface FormButtonsProps {
    onCancel: () => void;
    busy?: boolean;
    saveLabel?: string;
    danger?: boolean;
}

export function FormButtons({ onCancel, busy, saveLabel = 'Save', danger }: FormButtonsProps) {
    return (
        <div className="formbtns">
            <button type="button" className="ibtn" title="Cancel" aria-label="Cancel" onClick={onCancel}>
                <Icon.x />
            </button>
            <button
                className={`ibtn ${danger ? 'danger' : 'add'}`}
                title={saveLabel}
                aria-label={busy ? 'Saving' : saveLabel}
                disabled={busy}
            >
                {danger ? <Icon.trash /> : <Icon.yes />}
            </button>
        </div>
    );
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" className="ibtn add" title={label} aria-label={label} onClick={onClick}>
            <Icon.plus />
        </button>
    );
}

export function BackLink({ to, label }: { to: string; label: string }) {
    return (
        <a className="backlink" href={to} title={label} aria-label={`Back to ${label.toLowerCase()}`}>
            <Icon.back />
        </a>
    );
}

/** Existing photos in an edit form: make one the main photo, or delete one. */
interface PhotoEditorProps {
    photos: Photo[];
    onMakeMain: (photo: Photo) => void;
    onDelete: (photo: Photo) => void;
}

export function PhotoEditor({ photos, onMakeMain, onDelete }: PhotoEditorProps) {
    if (!photos?.length) return null;
    return (
        <div className="photo-edit">
            <span className="lbl-sm">Photos</span>
            <div className="photo-edit-list">
                {photos.map((p, i) => (
                    <div className={`pe${i === 0 ? ' main' : ''}`} key={p.id}>
                        <img src={p.thumbUrl} alt={`Photo ${i + 1}`} />
                        {i === 0 ? (
                            <span className="pe-main">Main</span>
                        ) : (
                            <button
                                type="button"
                                className="pe-btn"
                                title="Make main photo"
                                aria-label="Make main photo"
                                onClick={() => onMakeMain(p)}
                            >
                                <Icon.star />
                            </button>
                        )}
                        <button
                            type="button"
                            className="pe-btn del"
                            title="Delete photo"
                            aria-label="Delete photo"
                            onClick={() => onDelete(p)}
                        >
                            <Icon.x />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
