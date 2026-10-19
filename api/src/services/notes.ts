// Notes: titled lists of observations about the car.
import type { PoolClient } from 'pg';
import { query, runner, tx } from '../db.js';
import type { IfMatch } from '../lib/preconditions.js';
import { resolveId, friendlyDbError, assignments, lockRef, softDelete, versionOf, uniqueKey } from './common.js';
import type { ColumnMap } from './common.js';
import type { Note, NoteInput, NoteRow } from '../types.js';

const COLS: ColumnMap<NoteInput> = { key: 'key', title: 'title', items: 'items' };
const toApi = (row: NoteRow): Note => ({
    id: row.id,
    key: row.key,
    title: row.title,
    items: row.items,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
});

/** Notes, oldest first; deleted ones (tombstones) are left out. */
export async function listNotes(): Promise<Note[]> {
    const { rows } = await query<NoteRow>(`SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY created_at, id`);
    return rows.map(toApi);
}

export async function getNote(ref: string, client?: PoolClient): Promise<Note> {
    const id = await resolveId('notes', ref, client);
    const { rows } = await runner(client)<NoteRow>('SELECT * FROM notes WHERE id = $1', [id]);
    return toApi(rows[0]);
}

export async function createNote(data: NoteInput): Promise<Note> {
    try {
        return await tx(async (client) => {
            if (data.key == null) data.key = await uniqueKey(client, 'notes', data.title ?? '', 'note');
            // Object.keys widens the keys to string; they are exactly the keys of NoteInput.
            const cols = (Object.keys(COLS) as (keyof NoteInput)[]).filter((field) => data[field] !== undefined);
            const { rows } = await client.query<NoteRow>(
                `INSERT INTO notes (${cols.map((field) => COLS[field]).join(', ')}) VALUES (${cols.map((_field, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
                cols.map((field) => data[field]),
            );
            return toApi(rows[0]);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

export async function updateNote(ref: string, data: NoteInput, im: IfMatch): Promise<Note> {
    try {
        return await tx(async (client) => {
            const id = await lockRef(client, 'notes', ref, im, getNote);
            const { sets, vals } = assignments(data, COLS, 2);
            if (sets.length)
                await client.query(`UPDATE notes SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [
                    id,
                    ...vals,
                ]);
            return getNote(id, client);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

/** Soft-delete a note. Returns the new version. */
export async function deleteNote(ref: string, im: IfMatch): Promise<number> {
    return tx(async (client) => {
        const id = await lockRef(client, 'notes', ref, im, getNote);
        await softDelete(client, 'notes', id);
        return versionOf(client, 'notes', id);
    });
}
