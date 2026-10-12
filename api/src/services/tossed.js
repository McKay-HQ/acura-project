// Tossed: parts sorted out and thrown away, kept for reference.
import { query, tx } from '../db.js';
import { removePhotoFiles } from '../lib/photos.js';
import { photosJson, mapPhotos, resolveId, friendlyDbError, assignments, addPhotos, photoFilesOf } from './common.js';

const COLS = { key: 'key', label: 'label', partNumber: 'part_number', reason: 'reason', tossedOn: 'tossed_on' };

const SELECT = `SELECT x.*, ${photosJson('tossed', 'x')} FROM tossed x`;

const toApi = (r) => ({
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

export async function listTossed() {
  const { rows } = await query(`${SELECT} ORDER BY x.sort_order, x.created_at`);
  return rows.map(toApi);
}

export async function getTossed(ref, client) {
  const run = client ? client.query.bind(client) : query;
  const id = await resolveId('tossed', ref, client);
  const { rows } = await run(`${SELECT} WHERE x.id = $1`, [id]);
  return toApi(rows[0]);
}

export async function createTossed(data, files) {
  try {
    return await tx(async (c) => {
      const cols = Object.keys(COLS).filter((k) => data[k] !== undefined);
      const { rows } = await c.query(
        `INSERT INTO tossed (${[...cols.map((k) => COLS[k]), 'sort_order'].join(', ')})
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}${cols.length ? ', ' : ''}
                 (SELECT COALESCE(max(sort_order) + 1, 0) FROM tossed))
         RETURNING id`,
        cols.map((k) => data[k]),
      );
      if (data.tossedOn === undefined) await c.query('UPDATE tossed SET tossed_on = CURRENT_DATE WHERE id = $1', [rows[0].id]);
      if (files?.length) await addPhotos('tossed', rows[0].id, files, c);
      return getTossed(rows[0].id, c);
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateTossed(ref, data) {
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

export async function deleteTossed(ref) {
  const id = await resolveId('tossed', ref);
  const files = await photoFilesOf('tossed', id);
  await query('DELETE FROM tossed WHERE id = $1', [id]);
  await removePhotoFiles(files);
}
