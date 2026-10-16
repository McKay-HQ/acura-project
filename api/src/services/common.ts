// Helpers shared by the services: looking records up by id or key, versions (If-Match), keys, soft deletes
// and photos.
import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import slugify from '@sindresorhus/slugify';
import { query, runner, tx } from '../db.js';
import { notFound, badRequest } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';
import { processPhoto, removePhotoFiles, photoUrl } from '../lib/photos.js';
import { preconditionFailed, versionMatches } from '../lib/preconditions.js';
import type { IfMatch } from '../lib/preconditions.js';
import type { KeyedTable, Photo, PhotoFileRow, PhotoJson, PhotoTable, Versioned } from '../types.js';

/** Maps every field of a validated input to its database column. */
export type ColumnMap<T> = { readonly [K in keyof T]-?: string };

// Which photos column belongs to which table.
export const OWNER: Readonly<Record<PhotoTable, string>> = {
    parts: 'part_id',
    containers: 'container_id',
    tossed: 'tossed_id',
};
const LABEL: Readonly<Record<KeyedTable, string>> = {
    parts: 'Part',
    containers: 'Container',
    tossed: 'Tossed item',
    notes: 'Note',
    tasks: 'Task',
};

/** SQL expression returning a JSON array of a record's photos, in display order. */
export const photosJson = (table: PhotoTable, alias: string): string => `(
  SELECT COALESCE(json_agg(json_build_object('id', p.id, 'filename', p.filename, 'thumb', p.thumb_filename,
           'width', p.width, 'height', p.height, 'source', p.source) ORDER BY p.sort_order, p.created_at), '[]')
  FROM photos p WHERE p.${OWNER[table]} = ${alias}.id) AS photos`;

export const mapPhotos = (rows: PhotoJson[] = []): Photo[] =>
    rows.map((p) => ({
        id: p.id,
        url: photoUrl(p.filename),
        thumbUrl: photoUrl(p.thumb),
        width: p.width,
        height: p.height,
        source: p.source ?? null,
    }));

/** Resolve a UUID or human-readable key to the UUID of a live (not deleted) record, or 404. */
export async function resolveId(table: KeyedTable, ref: string, client?: PoolClient): Promise<string> {
    const run = runner(client);
    const by = isUuid(ref) ? 'id' : 'key';
    const { rows } = await run<{ id: string }>(`SELECT id FROM ${table} WHERE ${by} = $1 AND deleted_at IS NULL`, [
        ref,
    ]);
    if (!rows.length) throw notFound(`${LABEL[table] || 'Record'} not found`);
    return rows[0].id;
}

/** Reads one record by UUID or key, optionally on a transaction client. */
export type Getter<T> = (ref: string, client?: PoolClient) => Promise<T>;

/**
 * Lock a live record for a write (until the transaction ends) and check the client's If-Match against its
 * version: 404 if it is gone, 412 with the current record if the version doesn't match.
 */
export async function lockVersion(
    c: PoolClient,
    table: KeyedTable,
    id: string,
    im: IfMatch,
    current: Getter<Versioned>,
): Promise<void> {
    const { rows } = await c.query<{ version: number }>(
        `SELECT version FROM ${table} WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id],
    );
    if (!rows.length) throw notFound(`${LABEL[table] || 'Record'} not found`);
    if (!versionMatches(im, rows[0].version)) throw preconditionFailed(await current(id, c));
}

/** Resolve a ref and lock the record against If-Match, inside the caller's transaction. Returns the UUID. */
export async function lockRef(
    c: PoolClient,
    table: KeyedTable,
    ref: string,
    im: IfMatch,
    current: Getter<Versioned>,
): Promise<string> {
    const id = await resolveId(table, ref, c);
    await lockVersion(c, table, id, im, current);
    return id;
}

/**
 * Mark a record deleted (a tombstone: hidden from normal reads, its key stays taken). Call it before removing the
 * record's photos or links, so the whole delete is one version bump.
 */
export async function softDelete(c: PoolClient, table: KeyedTable, id: string): Promise<void> {
    await c.query(`UPDATE ${table} SET deleted_at = now(), updated_at = now() WHERE id = $1`, [id]);
}

/** A record's current version (deleted or not), e.g. at the end of a write. */
export async function versionOf(c: PoolClient, table: KeyedTable, id: string): Promise<number> {
    const { rows } = await c.query<{ version: number }>(`SELECT version FROM ${table} WHERE id = $1`, [id]);
    return rows[0].version;
}

const KEY_MAX = 60;

/**
 * A key for a new record, made from its name: slugified, at most 60 characters, with -2, -3... added when the
 * key is taken (deleted records keep theirs). `fallback` is used when the name has no usable characters.
 */
export async function uniqueKey(c: PoolClient, table: KeyedTable, name: string, fallback: string): Promise<string> {
    const trim = (s: string, max: number): string => s.slice(0, max).replace(/-+$/, '');
    let base = trim(slugify(name), KEY_MAX) || fallback;
    if (isUuid(base)) base = trim(`${fallback}-${base}`, KEY_MAX);
    for (let n = 1; ; n++) {
        const suffix = n === 1 ? '' : `-${n}`;
        const key = `${trim(base, KEY_MAX - suffix.length)}${suffix}`;
        const { rowCount } = await c.query(`SELECT 1 FROM ${table} WHERE key = $1`, [key]);
        if (!rowCount) return key;
    }
}

/** Turn a unique-violation on "key" into a friendly 409. */
export function friendlyDbError(err: unknown): unknown {
    // pg's DatabaseError carries `code` and `constraint`; anything else passes through untouched.
    const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined;
    const constraint = typeof err === 'object' && err !== null && 'constraint' in err ? err.constraint : undefined;
    if (code === '23505' && /_key_key/.test(typeof constraint === 'string' ? constraint : '')) {
        const e = badRequest('That key is already used by another record');
        e.status = 409;
        return e;
    }
    if (code === '23514' && constraint === 'value_range') {
        return badRequest('Low value cannot be more than the high value');
    }
    return err;
}

/** Build "col = $n" assignments for an UPDATE from a field→column map. */
export function assignments<T extends object>(
    data: T,
    cols: ColumnMap<T>,
    startAt = 1,
): { sets: string[]; vals: unknown[] } {
    const sets: string[] = [];
    const vals: unknown[] = [];
    // Object.entries widens the keys to string; they are exactly the keys of T.
    for (const [k, col] of Object.entries(cols) as [keyof T, string][]) {
        if (data[k] !== undefined) {
            vals.push(data[k]);
            sets.push(`${col} = $${startAt + vals.length - 1}`);
        }
    }
    return { sets, vals };
}

const CATALOG_NAME = /^[0-9a-f]{32}\.(jpe?g|png|webp)$/i;

/**
 * The name a photo is recorded under: the uploaded file's base name when it is named like a catalog photo
 * (`<32 hex>.jpg`), otherwise `<photo id>.jpg`. Either way every photo has a stable, unique name.
 */
export function photoSource(uploadedName: string | undefined, photoId: string): string {
    const base = uploadedName ? (uploadedName.split(/[\\/]/).pop() ?? '') : '';
    return CATALOG_NAME.test(base) ? base : `${photoId}.jpg`;
}

/** Process uploaded files and attach them to a record, after any existing photos. */
export async function addPhotos(
    table: PhotoTable,
    id: string,
    files: Express.Multer.File[] | undefined,
    client?: PoolClient,
): Promise<void> {
    if (!files?.length) throw badRequest('Choose at least one photo');
    const col = OWNER[table];
    const written: PhotoFileRow[] = [];
    const work = async (c: PoolClient): Promise<void> => {
        const { rows } = await c.query<{ n: number }>(
            `SELECT COALESCE(max(sort_order) + 1, 0) AS n FROM photos WHERE ${col} = $1`,
            [id],
        );
        let order = rows[0].n;
        for (const f of files) {
            const p = await processPhoto(f.buffer);
            written.push({ filename: p.filename, thumb_filename: p.thumbFilename });
            const photoId = crypto.randomUUID();
            await c.query(
                `INSERT INTO photos (id, ${col}, filename, thumb_filename, width, height, sort_order, source)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    photoId,
                    id,
                    p.filename,
                    p.thumbFilename,
                    p.width,
                    p.height,
                    order++,
                    photoSource(f.originalname, photoId),
                ],
            );
        }
    };
    try {
        if (client) await work(client);
        else await tx(work);
    } catch (err) {
        await removePhotoFiles(written);
        throw err;
    }
}

/** Add uploaded photos to a record (after any existing ones), checking If-Match. Returns the updated record. */
export async function addRecordPhotos<T>(
    table: PhotoTable,
    ref: string,
    files: Express.Multer.File[] | undefined,
    im: IfMatch,
    get: Getter<T & Versioned>,
): Promise<T> {
    if (!files?.length) throw badRequest('Choose at least one photo');
    return tx(async (c) => {
        const id = await lockRef(c, table, ref, im, get);
        await addPhotos(table, id, files, c);
        return get(id, c);
    });
}

/** Set photo order; ids must be exactly the record's photos. The first is the main photo. */
export async function reorderPhotos<T>(
    table: PhotoTable,
    ref: string,
    ids: unknown,
    im: IfMatch,
    get: Getter<T & Versioned>,
): Promise<T> {
    const col = OWNER[table];
    if (!Array.isArray(ids)) throw badRequest('ids must be a list of photo ids');
    const list: unknown[] = ids;
    return tx(async (c) => {
        const id = await lockRef(c, table, ref, im, get);
        const { rows } = await c.query<{ id: string }>(`SELECT id FROM photos WHERE ${col} = $1`, [id]);
        const have = new Set<unknown>(rows.map((r) => r.id));
        if (list.length !== have.size || !list.every((x) => have.has(x))) {
            throw badRequest('ids must list every photo of this record exactly once');
        }
        for (const [i, pid] of list.entries())
            await c.query('UPDATE photos SET sort_order = $1 WHERE id = $2', [i, pid]);
        return get(id, c);
    });
}

interface PhotoOwnerRow {
    part_id: string | null;
    container_id: string | null;
    tossed_id: string | null;
}

/**
 * Delete one photo of a live record, checking If-Match against that record's version. Returns the updated
 * record (a part, container or tossed record, read with the matching getter).
 */
export async function deletePhoto(
    photoId: string,
    im: IfMatch,
    getters: Record<PhotoTable, Getter<Versioned>>,
): Promise<Versioned> {
    const { rows } = await query<PhotoOwnerRow>('SELECT part_id, container_id, tossed_id FROM photos WHERE id = $1', [
        photoId,
    ]);
    if (!rows.length) throw notFound('Photo not found');
    const r = rows[0];
    // The one_owner constraint guarantees exactly one owner column is set, so tossed_id is non-null here.
    const [table, ownerId]: [PhotoTable, string] = r.part_id
        ? ['parts', r.part_id]
        : r.container_id
          ? ['containers', r.container_id]
          : ['tossed', r.tossed_id as string];
    const get = getters[table];
    const { files, record } = await tx(async (c) => {
        await lockVersion(c, table, ownerId, im, get);
        const del = await c.query<PhotoFileRow>('DELETE FROM photos WHERE id = $1 RETURNING filename, thumb_filename', [
            photoId,
        ]);
        if (!del.rowCount) throw notFound('Photo not found');
        return { files: del.rows, record: await get(ownerId, c) };
    });
    await removePhotoFiles(files);
    return record;
}

/** Delete a record's photo rows (inside its delete transaction); returns their files to remove after commit. */
export async function deleteRecordPhotos(c: PoolClient, table: PhotoTable, id: string): Promise<PhotoFileRow[]> {
    const { rows } = await c.query<PhotoFileRow>(
        `DELETE FROM photos WHERE ${OWNER[table]} = $1 RETURNING filename, thumb_filename`,
        [id],
    );
    return rows;
}
