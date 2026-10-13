// Request validation. Each validator returns a clean object of only the fields that
// were provided, so it works for both create and partial update.
import { badRequest } from './errors.js';
import type {
    ContainerIcon,
    ContainerInput,
    NoteInput,
    PartInput,
    PartStatus,
    Phase,
    TaskInput,
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

export const isUuid = (v: unknown): boolean => UUID.test(String(v));

/** Route ids may be a UUID or a record's human-readable key (e.g. "injen-intake"). */
export function assertRef(ref: unknown, what = 'id'): string {
    const v = String(ref || '');
    if (!isUuid(v) && !KEY.test(v)) throw badRequest(`Invalid ${what}`);
    return v;
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
};
const nm = (k: string): string => NAMES[k] || k;

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
    const v = body[key] == null ? '' : String(body[key]).trim();
    if ((required || nonEmpty) && !v) errors.push(`${nm(key)} cannot be empty`);
    if (v.length > max) errors.push(`${nm(key)} is too long (max ${max} characters)`);
    return v;
}

/** A true/false field. Accepts JSON booleans, and "true"/"false" strings from forms; anything else is an error. */
function bool(body: Body, key: string, errors: string[]): boolean | undefined {
    if (!(key in body)) return undefined;
    const v = body[key];
    if (v === true || v === 'true') return true;
    if (v === false || v === 'false') return false;
    errors.push(`${nm(key)} must be true or false`);
    return undefined; // never reaches the caller: done() throws because errors is non-empty
}

const isOneOf = <T>(allowed: readonly T[], v: unknown): v is T => (allowed as readonly unknown[]).includes(v);

function oneOf<T extends string>(body: Body, key: string, allowed: readonly T[], errors: string[]): T | undefined {
    if (!(key in body)) return undefined;
    const v = body[key];
    if (!isOneOf(allowed, v)) {
        errors.push(`${nm(key)} must be one of: ${allowed.join(', ')}`);
        return undefined; // never reaches the caller: done() throws because errors is non-empty
    }
    return v;
}

function money(body: Body, key: string, errors: string[]): number | null | undefined {
    if (!(key in body)) return undefined;
    const raw = body[key];
    if (raw === null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 99999999) errors.push(`${nm(key)} must be a positive amount`);
    return Math.round(n * 100) / 100;
}

/** A list of short strings. Accepts a JSON array or a comma-separated string (from forms). */
function stringList(
    body: Body,
    key: string,
    errors: string[],
    { maxItems = 30, maxLen = 60, unique = true } = {},
): string[] | undefined {
    if (!(key in body)) return undefined;
    let v: unknown = body[key];
    if (v == null || v === '') return [];
    if (typeof v === 'string') {
        try {
            v = v.trim().startsWith('[') ? JSON.parse(v) : v.split(',');
        } catch {
            errors.push(`${nm(key)} must be a list`);
            return undefined;
        }
    }
    if (!Array.isArray(v)) {
        errors.push(`${nm(key)} must be a list`);
        return undefined;
    }
    const items: unknown[] = v;
    let out = items.map((x) => String(x ?? '').trim()).filter(Boolean);
    if (unique) out = [...new Set(out)];
    if (out.length > maxItems) errors.push(`${nm(key)}: at most ${maxItems} entries`);
    if (out.some((x) => x.length > maxLen)) errors.push(`${nm(key)}: each entry must be at most ${maxLen} characters`);
    return out;
}

function dateOnly(body: Body, key: string, errors: string[]): string | null | undefined {
    if (!(key in body)) return undefined;
    const v = body[key];
    if (v == null || v === '') return null;
    // Date.parse converts its argument to a string, so String(v) is what it always parsed.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(Date.parse(String(v)))) {
        errors.push(`${nm(key)} must be a date like 2026-10-06`);
    }
    return String(v);
}

function keyField(body: Body, errors: string[]): string | null | undefined {
    if (!('key' in body)) return undefined;
    if (body.key == null || body.key === '') return null;
    const v = String(body.key).trim().toLowerCase();
    if (!KEY.test(v) || isUuid(v)) errors.push('Key must be lowercase letters, numbers, dots, dashes or underscores');
    return v;
}

function intIn(body: Body, key: string, errors: string[], min: number, max: number): number | undefined {
    if (!(key in body)) return undefined;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < min || n > max)
        errors.push(`${nm(key)} must be a whole number from ${min} to ${max}`);
    return n;
}

/** A UUID-or-key reference; null/'' clears it. */
function ref(body: Body, key: string, errors: string[]): string | null | undefined {
    if (!(key in body)) return undefined;
    const v = body[key];
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (!isUuid(s) && !KEY.test(s)) errors.push(`${nm(key)} must be an id or key`);
    return s;
}

function containerRef(body: Body, errors: string[]): string | null | undefined {
    // Accept containerId (UUID or key); null/'' clears it.
    const k = 'containerId' in body ? 'containerId' : 'container' in body ? 'container' : null;
    if (!k) return undefined;
    const v = body[k];
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (!isUuid(s) && !KEY.test(s)) errors.push('Container must be a container id or key');
    return s;
}

/** Drop the fields that were not provided. Object.fromEntries loses the key types, hence the cast. */
const compact = <T extends object>(obj: T): T =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

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

export function validateTask(input: unknown = {}, { create = false }: ValidateOptions = {}): TaskInput {
    const body = asBody(input);
    const errors: string[] = [];
    const out = compact<TaskInput>({
        title: text(body, 'title', errors, { required: create, nonEmpty: true, max: 200 }),
        // intIn checks the 1-4 range; anything else is reported and done() throws.
        phase: intIn(body, 'phase', errors, 1, 4) as Phase | undefined,
        notes: text(body, 'notes', errors, { max: 5000 }),
        done: bool(body, 'done', errors),
        partIds: stringList(body, 'partIds', errors, { maxItems: 200, maxLen: 80 }),
    });
    if (out.partIds?.some((x) => !isUuid(x) && !KEY.test(x))) errors.push('Parts must be part ids or keys');
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
