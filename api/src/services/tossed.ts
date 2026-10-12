// Tossed: parts sorted out and thrown away, kept for reference.
import type { PoolClient } from 'pg';
import { query, runner, tx } from '../db.js';
import { removePhotoFiles } from '../lib/photos.js';
import { photosJson, mapPhotos, resolveId, friendlyDbError, assignments, addPhotos, photoFilesOf } from './common.js';
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

const toApi = (r: TossedRow): Tossed => ({
    id: r.id,
    key: r.key,
    label: r.label,
    partNumber: r.part_number,
    reason: r.reason,
    tossedOn: r.tossed_on,
    photos: mapPhotos(r.photos),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
});

export async function listTossed(): Promise<Tossed[]> {
    const { rows } = await query<TossedRow>(`${SELECT} ORDER BY x.sort_order, x.created_at`);
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
        return await tx(async (c) => {
            // Object.keys widens the keys to string; they are exactly the keys of TossedInput.
            const cols = (Object.keys(COLS) as (keyof TossedInput)[]).filter((k) => data[k] !== undefined);
            const { rows } = await c.query<{ id: string }>(
                `INSERT INTO tossed (${[...cols.map((k) => COLS[k]), 'sort_order'].join(', ')})
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}${cols.length ? ', ' : ''}
                 (SELECT COALESCE(max(sort_order) + 1, 0) FROM tossed))
         RETURNING id`,
                cols.map((k) => data[k]),
            );
            if (data.tossedOn === undefined)
                await c.query('UPDATE tossed SET tossed_on = CURRENT_DATE WHERE id = $1', [rows[0].id]);
            if (files?.length) await addPhotos('tossed', rows[0].id, files, c);
            return getTossed(rows[0].id, c);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

export async function updateTossed(ref: string, data: TossedInput): Promise<Tossed> {
    const id = await resolveId('tossed', ref);
    const { sets, vals } = assignments(data, COLS, 2);
    if (sets.length) {
        try {
            await query(`UPDATE tossed SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...vals]);
        } catch (err) {
            throw friendlyDbError(err);
        }
    }
    return getTossed(id);
}

export async function deleteTossed(ref: string): Promise<void> {
    const id = await resolveId('tossed', ref);
    const files = await photoFilesOf('tossed', id);
    await query('DELETE FROM tossed WHERE id = $1', [id]);
    await removePhotoFiles(files);
}
