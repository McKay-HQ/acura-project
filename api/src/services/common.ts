// Helpers shared by the services: looking records up by id or key, and photos.
import type { PoolClient } from 'pg';
import { query, runner, tx } from '../db.js';
import { notFound, badRequest } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';
import { processPhoto, removePhotoFiles, photoUrl } from '../lib/photos.js';
import type { KeyedTable, Photo, PhotoFileRow, PhotoJson, PhotoTable } from '../types.js';

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

/** Resolve a UUID or human-readable key to the record's UUID, or 404. */
export async function resolveId(table: KeyedTable, ref: string, client?: PoolClient): Promise<string> {
    const run = runner(client);
    const sql = isUuid(ref) ? `SELECT id FROM ${table} WHERE id = $1` : `SELECT id FROM ${table} WHERE key = $1`;
    const { rows } = await run<{ id: string }>(sql, [ref]);
    if (!rows.length) throw notFound(`${LABEL[table] || 'Record'} not found`);
    return rows[0].id;
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

/** The name a photo is recorded under: the uploaded file's base name, or null if it has none. */
const sourceName = (name: string | undefined): string | null => (name ? name.split(/[\\/]/).pop() || null : null);

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
            await c.query(
                `INSERT INTO photos (${col}, filename, thumb_filename, width, height, sort_order, source)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [id, p.filename, p.thumbFilename, p.width, p.height, order++, sourceName(f.originalname)],
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

/** Set photo order; ids must be exactly the record's photos. The first is the main photo. */
export async function reorderPhotos(table: PhotoTable, id: string, ids: unknown): Promise<void> {
    const col = OWNER[table];
    if (!Array.isArray(ids)) throw badRequest('ids must be a list of photo ids');
    const list: unknown[] = ids;
    await tx(async (c) => {
        const { rows } = await c.query<{ id: string }>(`SELECT id FROM photos WHERE ${col} = $1`, [id]);
        const have = new Set<unknown>(rows.map((r) => r.id));
        if (list.length !== have.size || !list.every((x) => have.has(x))) {
            throw badRequest('ids must list every photo of this record exactly once');
        }
        for (const [i, pid] of list.entries())
            await c.query('UPDATE photos SET sort_order = $1 WHERE id = $2', [i, pid]);
    });
}

interface DeletedPhotoRow extends PhotoFileRow {
    part_id: string | null;
    container_id: string | null;
    tossed_id: string | null;
}

/** Delete one photo; returns which record it belonged to. */
export async function deletePhoto(photoId: string): Promise<[PhotoTable, string]> {
    const { rows } = await query<DeletedPhotoRow>(
        'DELETE FROM photos WHERE id = $1 RETURNING filename, thumb_filename, part_id, container_id, tossed_id',
        [photoId],
    );
    if (!rows.length) throw notFound('Photo not found');
    await removePhotoFiles(rows);
    const r = rows[0];
    // The one_owner constraint guarantees exactly one owner column is set, so tossed_id is non-null here.
    return r.part_id
        ? ['parts', r.part_id]
        : r.container_id
          ? ['containers', r.container_id]
          : ['tossed', r.tossed_id as string];
}

/** Photo files of a record, captured before it is deleted (the rows cascade). */
export async function photoFilesOf(table: PhotoTable, id: string, client?: PoolClient): Promise<PhotoFileRow[]> {
    const run = runner(client);
    const { rows } = await run<PhotoFileRow>(`SELECT filename, thumb_filename FROM photos WHERE ${OWNER[table]} = $1`, [
        id,
    ]);
    return rows;
}
