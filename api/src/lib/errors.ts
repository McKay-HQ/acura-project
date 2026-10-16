/**
 * @openapi
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       description: Every error response (written by the error handler in index.ts).
 *       required: [error]
 *       properties:
 *         error:
 *           type: string
 *           description: A message that can be shown to the user.
 *         details:
 *           type: array
 *           description: For validation errors, one message per field problem.
 *           items:
 *             type: string
 */
export class HttpError extends Error {
    status: number;
    details: unknown;
    /** More fields for the error body, e.g. `current` on a 412. */
    extra?: Record<string, unknown>;

    constructor(status: number, message: string, details?: unknown, extra?: Record<string, unknown>) {
        super(message);
        this.status = status;
        this.details = details;
        this.extra = extra;
    }
}

export const badRequest = (msg: string, details?: unknown): HttpError => new HttpError(400, msg, details);
export const notFound = (what = 'Not found'): HttpError => new HttpError(404, what);
