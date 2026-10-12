export class HttpError extends Error {
    status: number;
    details: unknown;

    constructor(status: number, message: string, details?: unknown) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

export const badRequest = (msg: string, details?: unknown): HttpError => new HttpError(400, msg, details);
export const notFound = (what = 'Not found'): HttpError => new HttpError(404, what);
