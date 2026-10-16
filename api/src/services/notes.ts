// Notes: titled lists of observations about the car.
import type { PoolClient } from 'pg';
import { query, runner, tx } from '../db.js';
import type { IfMatch } from '../lib/preconditions.js';
import { resolveId, friendlyDbError, assignments, lockRef, softDelete, versionOf, uniqueKey } from './common.js';
import type { ColumnMap } from './common.js';
import type { Note, NoteInput, NoteRow } from '../types.js';

const COLS: ColumnMap<NoteInput> = { key: 'key', title: 'title', items: 'items' };
const toApi = (r: NoteRow): Note => ({
    id: r.id,
    key: r.key,
    title: r.title,
    items: r.items,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
});

/** Notes, oldest first; deleted ones (tombstones) only with includeDeleted. */
export async function listNotes(includeDeleted = false): Promise<Note[]> {
    const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    const { rows } = await query<NoteRow>(`SELECT * FROM notes ${where} ORDER BY created_at, id`);
    return rows.map(toApi);
}

export async function getNote(ref: string, client?: PoolClient): Promise<Note> {
    const id = await resolveId('notes', ref, client);
    const { rows } = await runner(client)<NoteRow>('SELECT * FROM notes WHERE id = $1', [id]);
    return toApi(rows[0]);
}

export async function createNote(data: NoteInput): Promise<Note> {
    try {
        return await tx(async (c) => {
            if (data.key == null) data.key = await uniqueKey(c, 'notes', data.title ?? '', 'note');
            // Object.keys widens the keys to string; they are exactly the keys of NoteInput.
            const cols = (Object.keys(COLS) as (keyof NoteInput)[]).filter((k) => data[k] !== undefined);
            const { rows } = await c.query<NoteRow>(
                `INSERT INTO notes (${cols.map((k) => COLS[k]).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
                cols.map((k) => data[k]),
            );
            return toApi(rows[0]);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

export async function updateNote(ref: string, data: NoteInput, im: IfMatch): Promise<Note> {
    try {
        return await tx(async (c) => {
            const id = await lockRef(c, 'notes', ref, im, getNote);
            const { sets, vals } = assignments(data, COLS, 2);
            if (sets.length)
                await c.query(`UPDATE notes SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...vals]);
            return getNote(id, c);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

/** Soft-delete a note. Returns the new version. */
export async function deleteNote(ref: string, im: IfMatch): Promise<number> {
    return tx(async (c) => {
        const id = await lockRef(c, 'notes', ref, im, getNote);
        await softDelete(c, 'notes', id);
        return versionOf(c, 'notes', id);
    });
}
