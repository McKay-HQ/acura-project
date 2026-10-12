// Notes: titled lists of observations about the car.
import { query } from '../db.js';
import { resolveId, friendlyDbError, assignments } from './common.js';

const COLS = { key: 'key', title: 'title', items: 'items' };
const toApi = (r) => ({ id: r.id, key: r.key, title: r.title, items: r.items, createdAt: r.created_at, updatedAt: r.updated_at });

export async function listNotes() {
  const { rows } = await query('SELECT * FROM notes ORDER BY created_at, id');
  return rows.map(toApi);
}

export async function getNote(ref) {
  const id = await resolveId('notes', ref);
  const { rows } = await query('SELECT * FROM notes WHERE id = $1', [id]);
  return toApi(rows[0]);
}

export async function createNote(data) {
  const cols = Object.keys(COLS).filter((k) => data[k] !== undefined);
  try {
    const { rows } = await query(
      `INSERT INTO notes (${cols.map((k) => COLS[k]).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      cols.map((k) => data[k]),
    );
    return toApi(rows[0]);
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateNote(ref, data) {
  const id = await resolveId('notes', ref);
  const { sets, vals } = assignments(data, COLS, 2);
  if (sets.length) {
    try {
      await query(`UPDATE notes SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...vals]);
    } catch (err) {
      throw friendlyDbError(err);
    }
  }
  return getNote(id);
}

export async function deleteNote(ref) {
  const id = await resolveId('notes', ref);
  await query('DELETE FROM notes WHERE id = $1', [id]);
}
