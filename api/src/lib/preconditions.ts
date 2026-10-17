// HTTP preconditions for writes to existing records (docs/sync-design.md, "API contract"):
// the client sends the version it last saw in If-Match; responses carry the current one in ETag.
import type { Request, Response } from 'express';
import { HttpError } from './errors.js';
import type { Versioned } from '../types.js';

/** The versions an If-Match header accepts: `*` (any current version) or a list of version numbers. */
export type IfMatch = '*' | readonly number[];

/**
 * Parse If-Match: `"3"`, `W/"3"` or a bare `3`; a comma-separated list matches any of them. Entries that are
 * not versions never match. A missing header is a 428.
 */
export function ifMatch(req: Request): IfMatch {
    const raw = req.get('if-match');
    if (raw === undefined || !raw.trim()) {
        throw new HttpError(428, `This change needs the record's version in an If-Match header, e.g. If-Match: "3"`);
    }
    const versions: number[] = [];
    for (const entry of raw.split(',')) {
        const tag = entry.trim();
        if (tag === '*') return '*';
        const match = /^(?:W\/)?"(\d+)"$/.exec(tag) ?? /^(\d+)$/.exec(tag);
        if (match) versions.push(Number(match[1]));
    }
    return versions;
}

export const versionMatches = (im: IfMatch, version: number): boolean => im === '*' || im.includes(version);

/** The 412 thrown when a record changed since the client read it; the body includes the current record. */
export const preconditionFailed = (current: Versioned): HttpError =>
    new HttpError(
        412,
        `This record was changed elsewhere (it is now at version ${current.version}). Reload it and try again.`,
        undefined,
        { current },
    );

export const etag = (version: number): string => `"${version}"`;

/** Send one record with its version as the ETag. */
export function sendRecord(res: Response, status: number, record: Versioned): void {
    res.status(status).set('ETag', etag(record.version)).json(record);
}

/** `?includeDeleted=1` (or `true`) on list endpoints. */
export const includeDeleted = (req: Request): boolean => {
    const value = req.query.includeDeleted;
    return value === '1' || value === 'true';
};
