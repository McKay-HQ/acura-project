// Thin client for the API. Every call throws an Error with a readable message on failure.
// If the server requires an access key, it is kept in this browser (localStorage) and sent
// as a Bearer token; a 401 fires a "needkey" event so the app can ask for it.
import type {
    AppConfig,
    Container,
    ContainerInput,
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
    set: (k: string): void => {
        try {
            k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE);
        } catch {
            /* storage blocked */
        }
    },
};
export const authEvents = new EventTarget();

/** An error response from the API, with its HTTP status. */
export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

/** Readable message for anything caught from an API call. */
export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
interface ErrorBody {
    error?: string;
    details?: unknown;
}

/** T is the JSON the endpoint returns; endpoints that answer 204 No Content use T = null. */
async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    const opts: RequestInit = { method, headers };
    const key = keyStore.get();
    if (key) headers.authorization = `Bearer ${key}`;
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
        const e = (data ?? {}) as ErrorBody; // error responses are { error, details? } (api/src/index.ts)
        const details = Array.isArray(e.details) ? ` ${e.details.join('. ')}.` : '';
        throw new ApiError((e.error || `Request failed (${res.status})`) + details, res.status);
    }
    // Cast: the JSON body is not validated at runtime; its shape is the API contract in types.ts.
    return data as T;
}

/** Values a multipart form field can take; arrays are sent as JSON. */
type FormValue = string | number | boolean | string[] | null | undefined;

function form(fields: Record<string, FormValue>, files: File[]): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        if (v === undefined || v === null) continue;
        fd.append(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
    }
    for (const f of files) fd.append('photos', f);
    return fd;
}

/** CRUD + photos for parts, containers and tossed. */
export interface Resource<T, Input> {
    list: (params?: Record<string, string>) => Promise<T[]>;
    get: (id: string) => Promise<T>;
    create: (fields: Input, files?: File[]) => Promise<T>;
    update: (id: string, fields: Partial<Input>) => Promise<T>;
    remove: (id: string) => Promise<null>;
    addPhotos: (id: string, files: File[]) => Promise<T>;
    reorderPhotos: (id: string, ids: string[]) => Promise<T>;
}

function resource<T, Input extends Record<string, FormValue>>(name: string): Resource<T, Input> {
    return {
        list: (params) => request<T[]>('GET', `/${name}${params ? `?${new URLSearchParams(params)}` : ''}`),
        get: (id) => request<T>('GET', `/${name}/${encodeURIComponent(id)}`),
        create: (fields, files = []) => request<T>('POST', `/${name}`, files.length ? form(fields, files) : fields),
        update: (id, fields) => request<T>('PATCH', `/${name}/${encodeURIComponent(id)}`, fields),
        remove: (id) => request<null>('DELETE', `/${name}/${encodeURIComponent(id)}`),
        addPhotos: (id, files) => request<T>('POST', `/${name}/${encodeURIComponent(id)}/photos`, form({}, files)),
        reorderPhotos: (id, ids) => request<T>('PUT', `/${name}/${encodeURIComponent(id)}/photos/order`, { ids }),
    };
}

export const api = {
    config: () => request<AppConfig>('GET', '/config'),
    checkKey: () => request<{ ok: boolean }>('POST', '/auth/check'),
    summary: () => request<Summary>('GET', '/summary'),
    tags: () => request<TagCount[]>('GET', '/tags'),
    parts: {
        ...resource<Part, PartInput>('parts'),
        toss: (id: string, body: TossInput) => request<Tossed>('POST', `/parts/${encodeURIComponent(id)}/toss`, body),
    },
    containers: resource<Container, ContainerInput>('containers'),
    tossed: resource<Tossed, TossedInput>('tossed'),
    /** Responds with the updated record the photo belonged to; the caller names which kind that is. */
    deletePhoto: <T extends Part | Container | Tossed = Part | Container | Tossed>(photoId: string) =>
        request<T>('DELETE', `/photos/${photoId}`),
    tasks: {
        list: () => request<Task[]>('GET', '/tasks'),
        create: (f: Partial<TaskInput> & Pick<TaskInput, 'title'>) => request<Task>('POST', '/tasks', f),
        update: (id: string, f: Partial<TaskInput>) => request<Task>('PATCH', `/tasks/${id}`, f),
        remove: (id: string) => request<null>('DELETE', `/tasks/${id}`),
    },
    notes: { list: () => request<Note[]>('GET', '/notes') },
};
