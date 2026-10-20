// Thin client for the API. Every call throws an Error with a readable message on failure.
// If the server requires an access key, it is kept in this browser (localStorage) and sent
// as a Bearer token; a 401 fires a "needkey" event so the app can ask for it.
import type {
    AppConfig,
    Container,
    ContainerInput,
    Expense,
    ExpenseInput,
    Note,
    Part,
    PartInput,
    Summary,
    TagCount,
    Task,
    TaskInput,
    Tossed,
    TossedInput,
    TossInput,
    VersionedRecord,
} from './types';

const KEY_STORE = 'rsxApiKey';
export const keyStore = {
    get: (): string => {
        try {
            return localStorage.getItem(KEY_STORE) || '';
        } catch {
            return '';
        }
    },
    set: (key: string): void => {
        try {
            if (key) localStorage.setItem(KEY_STORE, key);
            else localStorage.removeItem(KEY_STORE);
        } catch {
            /* storage blocked */
        }
    },
};
/** "needkey" fires on a 401; "conflict" fires on a 412 (someone else changed the record first). */
export const authEvents = new EventTarget();

/** An error response from the API, with its HTTP status. */
export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

export const CONFLICT_MESSAGE =
    "Someone else changed this while you were editing. It's been reloaded — your change wasn't saved.";

/**
 * 412: the record changed since the version this browser sent, and nothing was saved.
 * `current` is the record as it is now (from the response body), when the server sent it.
 */
export class PreconditionFailedError extends ApiError {
    current: VersionedRecord | null;
    constructor(current: VersionedRecord | null) {
        super(CONFLICT_MESSAGE, 412);
        this.current = current;
    }
    /** The current version of `rec`, if the server sent it back. */
    currentFor<T extends VersionedRecord>(rec: T): T | null {
        const current = this.current;
        // Cast: same id as the record that was written, so it is the same kind of record.
        return current && current.id === rec.id ? (current as T) : null;
    }
}

/** Readable message for anything caught from an API call. */
export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** What a write to an existing record needs: its id and the version this browser last saw. */
export interface Versioned {
    id: string;
    version: number;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
interface ErrorBody {
    error?: string;
    details?: unknown;
    current?: VersionedRecord;
}

/**
 * T is the JSON the endpoint returns; endpoints that answer 204 No Content use T = null.
 * `version` is the record's version for writes to an existing record; it is sent as If-Match.
 */
async function request<T>(method: Method, path: string, body?: unknown, version?: number): Promise<T> {
    const headers: Record<string, string> = {};
    const opts: RequestInit = { method, headers };
    const key = keyStore.get();
    if (key) headers.authorization = `Bearer ${key}`;
    if (version !== undefined) headers['if-match'] = `"${version}"`;
    if (body instanceof FormData) {
        opts.body = body;
    } else if (body !== undefined) {
        headers['content-type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    let res: Response;
    try {
        res = await fetch(`/api${path}`, opts);
    } catch {
        throw new Error('Could not reach the server. Check that the app is running.');
    }
    // Cast: the caller states the response type; a 204 has no body and callers expecting it use T = null.
    if (res.status === 204) return null as T;
    const data: unknown = await res.json().catch(() => ({}));
    if (res.status === 401) authEvents.dispatchEvent(new Event('needkey'));
    if (!res.ok) {
        const body = (data ?? {}) as ErrorBody; // error responses are { error, details?, current? } (api/src/index.ts)
        if (res.status === 412) {
            authEvents.dispatchEvent(new Event('conflict'));
            throw new PreconditionFailedError(body.current ?? null);
        }
        const details = Array.isArray(body.details) ? ` ${body.details.join('. ')}.` : '';
        throw new ApiError((body.error || `Request failed (${res.status})`) + details, res.status);
    }
    // Cast: the JSON body is not validated at runtime; its shape is the API contract in types.ts.
    return data as T;
}

/** A write to an existing record: sends the record's version as If-Match. */
const write = <T>(method: Method, path: string, rec: Versioned, body?: unknown) =>
    request<T>(method, path, body, rec.version);

/** Values a multipart form field can take; arrays are sent as JSON. */
type FormValue = string | number | boolean | string[] | null | undefined;

function form(fields: Record<string, FormValue>, files: File[]): FormData {
    const fd = new FormData();
    for (const [name, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        fd.append(name, Array.isArray(value) ? JSON.stringify(value) : String(value));
    }
    for (const file of files) fd.append('photos', file);
    return fd;
}

/**
 * CRUD + photos for parts, containers and tossed. Writes to an existing record take the
 * record itself (its id and version) and resolve to the updated record with its new version;
 * keep that one for the next write. A stale version rejects with PreconditionFailedError.
 */
export interface Resource<T extends Versioned, Input> {
    list: (params?: Record<string, string>) => Promise<T[]>;
    get: (id: string) => Promise<T>;
    create: (fields: Input, files?: File[]) => Promise<T>;
    update: (record: T, fields: Partial<Input>) => Promise<T>;
    remove: (record: T) => Promise<null>;
    addPhotos: (record: T, files: File[]) => Promise<T>;
    reorderPhotos: (record: T, photoIds: string[]) => Promise<T>;
    /** Deletes one of the record's photos; responds with the updated record. */
    deletePhoto: (record: T, photoId: string) => Promise<T>;
}

function resource<T extends Versioned, Input extends Record<string, FormValue>>(name: string): Resource<T, Input> {
    const at = (rec: Versioned, sub = '') => `/${name}/${encodeURIComponent(rec.id)}${sub}`;
    return {
        list: (params) => request<T[]>('GET', `/${name}${params ? `?${new URLSearchParams(params)}` : ''}`),
        get: (id) => request<T>('GET', `/${name}/${encodeURIComponent(id)}`),
        create: (fields, files = []) => request<T>('POST', `/${name}`, files.length ? form(fields, files) : fields),
        update: (rec, fields) => write<T>('PATCH', at(rec), rec, fields),
        remove: (rec) => write<null>('DELETE', at(rec), rec),
        addPhotos: (rec, files) => write<T>('POST', at(rec, '/photos'), rec, form({}, files)),
        reorderPhotos: (rec, ids) => write<T>('PUT', at(rec, '/photos/order'), rec, { ids }),
        deletePhoto: (rec, photoId) => write<T>('DELETE', `/photos/${encodeURIComponent(photoId)}`, rec),
    };
}

export const api = {
    config: () => request<AppConfig>('GET', '/config'),
    checkKey: () => request<{ ok: boolean }>('POST', '/auth/check'),
    summary: () => request<Summary>('GET', '/summary'),
    tags: () => request<TagCount[]>('GET', '/tags'),
    parts: {
        ...resource<Part, PartInput>('parts'),
        toss: (part: Part, body: TossInput) =>
            write<Tossed>('POST', `/parts/${encodeURIComponent(part.id)}/toss`, part, body),
    },
    containers: resource<Container, ContainerInput>('containers'),
    tossed: resource<Tossed, TossedInput>('tossed'),
    tasks: {
        list: () => request<Task[]>('GET', '/tasks'),
        create: (input: Partial<TaskInput> & Pick<TaskInput, 'title'>) => request<Task>('POST', '/tasks', input),
        update: (task: Task, changes: Partial<TaskInput>) =>
            write<Task>('PATCH', `/tasks/${encodeURIComponent(task.id)}`, task, changes),
        remove: (task: Task) => write<null>('DELETE', `/tasks/${encodeURIComponent(task.id)}`, task),
    },
    notes: { list: () => request<Note[]>('GET', '/notes') },
    expenses: {
        list: () => request<Expense[]>('GET', '/expenses'),
        create: (input: ExpenseInput) => request<Expense>('POST', '/expenses', input),
        update: (expense: Expense, changes: Partial<ExpenseInput>) =>
            write<Expense>('PATCH', `/expenses/${encodeURIComponent(expense.id)}`, expense, changes),
        remove: (expense: Expense) => write<null>('DELETE', `/expenses/${encodeURIComponent(expense.id)}`, expense),
    },
};
