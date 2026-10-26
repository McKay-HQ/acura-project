// Request validation. Each validator returns a clean object of only the fields that
// were provided, so it works for both create and partial update.
import { badRequest } from './errors.js';
import type {
    ContainerIcon,
    ContainerInput,
    ExpenseInput,
    NoteInput,
    PartInput,
    PartStatus,
    Phase,
    TaskInput,
    TaskStep,
    TossedInput,
    ValidateOptions,
} from '../types.js';

export const STATUSES: readonly PartStatus[] = ['Verified', 'Unverified', 'Unknown'];
export const PHASES: Readonly<Record<Phase, string>> = {
    1: 'Before Driving',
    2: 'Priority',
    3: 'Non-Priority',
    4: 'Performance',
};
export const ICONS: readonly ContainerIcon[] = [
    'trim',
    'engine',
    'electrical',
    'other',
    'askcody',
    'none',
    'hardware',
    'box',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;

/** A request body: any JSON object, with every value still unchecked. */
type Body = Record<string, unknown>;

export const isUuid = (value: unknown): boolean => UUID.test(String(value));

/** Route ids may be a UUID or a record's human-readable key (e.g. "injen-intake"). */
export function assertRef(ref: unknown, what = 'id'): string {
    const value = String(ref || '');
    if (!isUuid(value) && !KEY.test(value)) throw badRequest(`Invalid ${what}`);
    return value;
}

export function assertUuid(id: string, what = 'id'): string {
    if (!isUuid(id)) throw badRequest(`Invalid ${what}`);
    return id;
}

// Human names for fields, used in error messages shown in the app.
const NAMES: Record<string, string> = {
    label: 'Name',
    name: 'Name',
    partNumber: 'Part number',
    fits: 'Fits',
    status: 'Status',
    tags: 'Tags',
    valueLow: 'Low value',
    valueHigh: 'High value',
    notes: 'Notes',
    containerId: 'Container',
    key: 'Key',
    location: 'Location',
    reason: 'Reason',
    tossedOn: 'Tossed date',
    title: 'Title',
    phase: 'Phase',
    partIds: 'Parts',
    parentId: 'Inside',
    icon: 'Icon',
    sortOrder: 'Order',
    items: 'Items',
    done: 'Done',
    steps: 'Steps',
    vendor: 'Vendor',
    price: 'Price',
    paid: 'Paid',
    paidOn: 'Date paid',
};
const nm = (key: string): string => NAMES[key] || key;

/**
 * Treat the untrusted body as a field map. The `in` checks below need an object; a primitive
 * body threw a TypeError (a 500) before the conversion, and still does.
 */
function asBody(body: unknown): Body {
    if (typeof body !== 'object' || body === null) {
        throw new TypeError(`Cannot use 'in' operator to search for fields in ${String(body)}`);
    }
    // Any non-null object can be indexed by string; its values stay `unknown` and are checked per field.
    return body as Body;
}

/**
 * A text field. `required`: must be present (on create). `nonEmpty`: if present, it can't be blank,
 * so an update can't clear a record's name (the database would reject it).
 */
function text(
    body: Body,
    key: string,
    errors: string[],
    { required = false, nonEmpty = false, max = 2000 } = {},
): string | undefined {
    if (!(key in body)) {
        if (required) errors.push(`${nm(key)} is required`);
        return undefined;
    }
    const value = body[key] == null ? '' : String(body[key]).trim();
    if ((required || nonEmpty) && !value) errors.push(`${nm(key)} cannot be empty`);
    if (value.length > max) errors.push(`${nm(key)} is too long (max ${max} characters)`);
    return value;
}

/** A true/false field. Accepts JSON booleans, and "true"/"false" strings from forms; anything else is an error. */
function bool(body: Body, key: string, errors: string[]): boolean | undefined {
    if (!(key in body)) return undefined;
    const value = body[key];
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    errors.push(`${nm(key)} must be true or false`);
    return undefined; // never reaches the caller: done() throws because errors is non-empty
}

const isOneOf = <T>(allowed: readonly T[], value: unknown): value is T =>
    (allowed as readonly unknown[]).includes(value);

function oneOf<T extends string>(body: Body, key: string, allowed: readonly T[], errors: string[]): T | undefined {
    if (!(key in body)) return undefined;
    const value = body[key];
    if (!isOneOf(allowed, value)) {
        errors.push(`${nm(key)} must be one of: ${allowed.join(', ')}`);
        return undefined; // never reaches the caller: done() throws because errors is non-empty
    }
    return value;
}

function money(body: Body, key: string, errors: string[]): number | null | undefined {
    if (!(key in body)) return undefined;
    const raw = body[key];
    if (raw === null || raw === '') return null;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0 || amount > 99999999)
        errors.push(`${nm(key)} must be a positive amount`);
    return Math.round(amount * 100) / 100;
}

/** A list of short strings. Accepts a JSON array or a comma-separated string (from forms). */
function stringList(
    body: Body,
    key: string,
    errors: string[],
    { maxItems = 30, maxLen = 60, unique = true } = {},
): string[] | undefined {
    if (!(key in body)) return undefined;
    let value: unknown = body[key];
    if (value == null || value === '') return [];
    if (typeof value === 'string') {
        try {
            value = value.trim().startsWith('[') ? JSON.parse(value) : value.split(',');
        } catch {
            errors.push(`${nm(key)} must be a list`);
            return undefined;
        }
    }
    if (!Array.isArray(value)) {
        errors.push(`${nm(key)} must be a list`);
        return undefined;
    }
    const items: unknown[] = value;
    let out = items.map((item) => String(item ?? '').trim()).filter(Boolean);
    if (unique) out = [...new Set(out)];
    if (out.length > maxItems) errors.push(`${nm(key)}: at most ${maxItems} entries`);
    if (out.some((item) => item.length > maxLen))
        errors.push(`${nm(key)}: each entry must be at most ${maxLen} characters`);
    return out;
}

function dateOnly(body: Body, key: string, errors: string[]): string | null | undefined {
    if (!(key in body)) return undefined;
    const value = body[key];
    if (value == null || value === '') return null;
    // Date.parse converts its argument to a string, so String(v) is what it always parsed.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(String(value)))) {
        errors.push(`${nm(key)} must be a date like 2026-10-06`);
    }
    return String(value);
}

function keyField(body: Body, errors: string[]): string | null | undefined {
    if (!('key' in body)) return undefined;
    if (body.key == null || body.key === '') return null;
    const value = String(body.key).trim().toLowerCase();
    if (!KEY.test(value) || isUuid(value))
        errors.push('Key must be lowercase letters, numbers, dots, dashes or underscores');
    return value;
}

function intIn(body: Body, key: string, errors: string[], min: number, max: number): number | undefined {
    if (!(key in body)) return undefined;
    const num = Number(body[key]);
    if (!Number.isInteger(num) || num < min || num > max)
        errors.push(`${nm(key)} must be a whole number from ${min} to ${max}`);
    return num;
}

/** A UUID-or-key reference; null/'' clears it. */
function ref(body: Body, key: string, errors: string[]): string | null | undefined {
    if (!(key in body)) return undefined;
    const value = body[key];
    if (value == null || value === '') return null;
    const trimmed = String(value).trim();
    if (!isUuid(trimmed) && !KEY.test(trimmed)) errors.push(`${nm(key)} must be an id or key`);
    return trimmed;
}

function containerRef(body: Body, errors: string[]): string | null | undefined {
    // Accept containerId (UUID or key); null/'' clears it.
    const field = 'containerId' in body ? 'containerId' : 'container' in body ? 'container' : null;
    if (!field) return undefined;
    const value = body[field];
    if (value == null || value === '') return null;
    const trimmed = String(value).trim();
    if (!isUuid(trimmed) && !KEY.test(trimmed)) errors.push('Container must be a container id or key');
    return trimmed;
}

/** Drop the fields that were not provided. Object.fromEntries loses the key types, hence the cast. */
const compact = <T extends object>(obj: T): T =>
    Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T;

function done<T>(out: T, errors: string[]): T {
    if (errors.length) throw badRequest('Check these fields:', errors);
    return out;
}

export function validatePart(input: unknown = {}, { create = false }: ValidateOptions = {}): PartInput {
    const body = asBody(input);
    const errors: string[] = [];
    const out = compact<PartInput>({
        key: keyField(body, errors),
        label: text(body, 'label', errors, { required: create, nonEmpty: true, max: 200 }),
        partNumber: text(body, 'partNumber', errors, { max: 300 }),
        fits: text(body, 'fits', errors, { max: 60 }),
        status: oneOf(body, 'status', STATUSES, errors),
        tags: stringList(body, 'tags', errors, { maxItems: 30, maxLen: 40 }),
        valueLow: money(body, 'valueLow', errors),
        valueHigh: money(body, 'valueHigh', errors),
        notes: text(body, 'notes', errors, { max: 5000 }),
        containerId: containerRef(body, errors),
    });
    if (out.valueLow != null && out.valueHigh != null && out.valueLow > out.valueHigh) {
        errors.push('Low value cannot be more than the high value');
    }
    return done(out, errors);
}

export function validateContainer(input: unknown = {}, { create = false }: ValidateOptions = {}): ContainerInput {
    const body = asBody(input);
    const errors: string[] = [];
    const out = compact<ContainerInput>({
        key: keyField(body, errors),
        name: text(body, 'name', errors, { required: create, nonEmpty: true, max: 120 }),
        location: text(body, 'location', errors, { max: 200 }),
        notes: text(body, 'notes', errors, { max: 5000 }),
        parentId: ref(body, 'parentId', errors),
        icon: oneOf(body, 'icon', ICONS, errors),
        sortOrder: intIn(body, 'sortOrder', errors, 0, 9999),
    });
    return done(out, errors);
}

export function validateTossed(input: unknown = {}, { create = false }: ValidateOptions = {}): TossedInput {
    const body = asBody(input);
    const errors: string[] = [];
    const out = compact<TossedInput>({
        key: keyField(body, errors),
        label: text(body, 'label', errors, { required: create, nonEmpty: true, max: 200 }),
        partNumber: text(body, 'partNumber', errors, { max: 300 }),
        reason: text(body, 'reason', errors, { max: 2000 }),
        tossedOn: dateOnly(body, 'tossedOn', errors),
    });
    return done(out, errors);
}

const PHOTO_REF = /^(exterior|engine|interior):\d{1,2}$/;
// An https URL, or a page in the app: /part/key (or the older #part/key, from before the app used paths).
const HREF = /^(https:\/\/\S+|[/#][a-z]+(\/[A-Za-z0-9._%-]+)?)$/;

/** Task steps: [{text, done, links?, photos?}]. null or [] clears them. */
function steps(body: Body, errors: string[]): TaskStep[] | undefined {
    if (!('steps' in body)) return undefined;
    const list = body.steps;
    if (list === null) return [];
    if (!Array.isArray(list)) {
        errors.push('Steps must be a list');
        return undefined;
    }
    if (list.length > 50) errors.push('Steps can have at most 50 items');
    const out: TaskStep[] = [];
    list.forEach((raw, index) => {
        const stepName = `Step ${index + 1}`;
        const fields = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const text = typeof fields.text === 'string' ? fields.text.trim() : '';
        if (!text) errors.push(`${stepName} needs text`);
        else if (text.length > 2000) errors.push(`${stepName} is too long (2000 characters max)`);
        if (fields.done !== undefined && typeof fields.done !== 'boolean')
            errors.push(`${stepName}: done must be true or false`);
        const step: TaskStep = { text, done: fields.done === true };
        if (fields.links !== undefined && fields.links !== null) {
            if (!Array.isArray(fields.links) || fields.links.length > 10)
                errors.push(`${stepName}: links must be a list of up to 10`);
            else {
                step.links = fields.links.map((rawLink) => {
                    const link = (rawLink && typeof rawLink === 'object' ? rawLink : {}) as Record<string, unknown>;
                    const label = typeof link.label === 'string' ? link.label.trim() : '';
                    const href = typeof link.href === 'string' ? link.href.trim() : '';
                    if (!label || label.length > 120)
                        errors.push(`${stepName}: each link needs a label (120 characters max)`);
                    if (!HREF.test(href) || href.length > 2000)
                        errors.push(`${stepName}: links must be https:// URLs or app pages like /part/key`);
                    return { label, href };
                });
                if (!step.links.length) delete step.links;
            }
        }
        if (fields.photos !== undefined && fields.photos !== null) {
            if (
                !Array.isArray(fields.photos) ||
                fields.photos.length > 6 ||
                fields.photos.some((photo) => !PHOTO_REF.test(String(photo)))
            )
                errors.push(`${stepName}: photos must be up to 6 car photo refs like "engine:03"`);
            else if (fields.photos.length) step.photos = fields.photos.map(String);
        }
        out.push(step);
    });
    return out;
}

export function validateTask(input: unknown = {}, { create = false }: ValidateOptions = {}): TaskInput {
    const body = asBody(input);
    const errors: string[] = [];
    const out = compact<TaskInput>({
        key: keyField(body, errors),
        title: text(body, 'title', errors, { required: create, nonEmpty: true, max: 200 }),
        // intIn checks the 1-4 range; anything else is reported and done() throws.
        phase: intIn(body, 'phase', errors, 1, 4) as Phase | undefined,
        notes: text(body, 'notes', errors, { max: 5000 }),
        steps: steps(body, errors),
        done: bool(body, 'done', errors),
        partIds: stringList(body, 'partIds', errors, { maxItems: 200, maxLen: 80 }),
    });
    if (out.partIds?.some((partId) => !isUuid(partId) && !KEY.test(partId)))
        errors.push('Parts must be part ids or keys');
    return done(out, errors);
}

export function validateNote(input: unknown = {}, { create = false }: ValidateOptions = {}): NoteInput {
    const body = asBody(input);
    const errors: string[] = [];
    const out = compact<NoteInput>({
        key: keyField(body, errors),
        title: text(body, 'title', errors, { required: create, nonEmpty: true, max: 200 }),
        items: stringList(body, 'items', errors, { maxItems: 200, maxLen: 2000, unique: false }),
    });
    return done(out, errors);
}

export function validateExpense(input: unknown = {}, { create = false }: ValidateOptions = {}): ExpenseInput {
    const body = asBody(input);
    const errors: string[] = [];
    const out = compact<ExpenseInput>({
        key: keyField(body, errors),
        label: text(body, 'label', errors, { required: create, nonEmpty: true, max: 200 }),
        vendor: text(body, 'vendor', errors, { max: 200 }),
        price: money(body, 'price', errors),
        paid: bool(body, 'paid', errors),
        paidOn: dateOnly(body, 'paidOn', errors),
        notes: text(body, 'notes', errors, { max: 5000 }),
    });
    // Every expense has a price: required on create, and it can't be cleared.
    if (create && !('price' in body)) errors.push('Price is required');
    else if (out.price === null) errors.push('Price cannot be empty');
    return done(out, errors);
}
