// Tossed: parts sorted out and thrown away, kept for reference.
import type { PoolClient } from 'pg';
import { query, runner, tx } from '../db.js';
import { removePhotoFiles } from '../lib/photos.js';
import type { IfMatch } from '../lib/preconditions.js';
import {
    photosJson,
    mapPhotos,
    resolveId,
    friendlyDbError,
    assignments,
    addPhotos,
    lockRef,
    softDelete,
    versionOf,
    uniqueKey,
    deleteRecordPhotos,
} from './common.js';
import type { ColumnMap } from './common.js';
import type { Tossed, TossedInput, TossedRow } from '../types.js';

const COLS: ColumnMap<TossedInput> = {
    key: 'key',
    label: 'label',
    partNumber: 'part_number',
    reason: 'reason',
    tossedOn: 'tossed_on',
};

const SELECT = `SELECT x.*, ${photosJson('tossed', 'x')} FROM tossed x`;

const toApi = (row: TossedRow): Tossed => ({
    id: row.id,
    key: row.key,
    label: row.label,
    partNumber: row.part_number,
    reason: row.reason,
    tossedOn: row.tossed_on,
    photos: mapPhotos(row.photos),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
});

/** Tossed records in display order; deleted ones (tombstones) only with includeDeleted. */
export async function listTossed(includeDeleted = false): Promise<Tossed[]> {
    const where = includeDeleted ? '' : 'WHERE x.deleted_at IS NULL';
    const { rows } = await query<TossedRow>(`${SELECT} ${where} ORDER BY x.sort_order, x.created_at`);
    return rows.map(toApi);
}

export async function getTossed(ref: string, client?: PoolClient): Promise<Tossed> {
    const run = runner(client);
    const id = await resolveId('tossed', ref, client);
    const { rows } = await run<TossedRow>(`${SELECT} WHERE x.id = $1`, [id]);
    return toApi(rows[0]);
}

export async function createTossed(data: TossedInput, files?: Express.Multer.File[]): Promise<Tossed> {
    try {
        return await tx(async (client) => {
            if (data.key == null) data.key = await uniqueKey(client, 'tossed', data.label ?? '', 'tossed');
            // tossedOn defaults to today (the database's date), set in the INSERT so the record starts at version 1.
            if (data.tossedOn === undefined)
                data.tossedOn = (await client.query<{ d: string }>('SELECT CURRENT_DATE::text AS d')).rows[0].d;
            // Object.keys widens the keys to string; they are exactly the keys of TossedInput.
            const cols = (Object.keys(COLS) as (keyof TossedInput)[]).filter((field) => data[field] !== undefined);
            const { rows } = await client.query<{ id: string }>(
                `INSERT INTO tossed (${[...cols.map((field) => COLS[field]), 'sort_order'].join(', ')})
         VALUES (${cols.map((_field, index) => `$${index + 1}`).join(', ')}${cols.length ? ', ' : ''}
                 (SELECT COALESCE(max(sort_order) + 1, 0) FROM tossed))
         RETURNING id`,
                cols.map((field) => data[field]),
            );
            if (files?.length) await addPhotos('tossed', rows[0].id, files, client);
            return getTossed(rows[0].id, client);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

export async function updateTossed(ref: string, data: TossedInput, im: IfMatch): Promise<Tossed> {
    try {
        return await tx(async (client) => {
            const id = await lockRef(client, 'tossed', ref, im, getTossed);
            const { sets, vals } = assignments(data, COLS, 2);
            if (sets.length)
                await client.query(`UPDATE tossed SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [
                    id,
                    ...vals,
                ]);
            return getTossed(id, client);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

/** Soft-delete a tossed record (its photos are removed). Returns the new version. */
export async function deleteTossed(ref: string, im: IfMatch): Promise<number> {
    const { version, files } = await tx(async (client) => {
        const id = await lockRef(client, 'tossed', ref, im, getTossed);
        await softDelete(client, 'tossed', id);
        const files = await deleteRecordPhotos(client, 'tossed', id);
        return { version: await versionOf(client, 'tossed', id), files };
    });
    await removePhotoFiles(files);
    return version;
}
