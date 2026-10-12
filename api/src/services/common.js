// Helpers shared by the services: looking records up by id or key, and photos.
import { query, tx } from '../db.js';
import { notFound, badRequest } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';
import { processPhoto, removePhotoFiles, photoUrl } from '../lib/photos.js';

// Which photos column belongs to which table.
export const OWNER = { parts: 'part_id', containers: 'container_id', tossed: 'tossed_id' };
const LABEL = { parts: 'Part', containers: 'Container', tossed: 'Tossed item', notes: 'Note' };

/** SQL expression returning a JSON array of a record's photos, in display order. */
export const photosJson = (table, alias) => `(
  SELECT COALESCE(json_agg(json_build_object('id', p.id, 'filename', p.filename, 'thumb', p.thumb_filename,
           'width', p.width, 'height', p.height) ORDER BY p.sort_order, p.created_at), '[]')
  FROM photos p WHERE p.${OWNER[table]} = ${alias}.id) AS photos`;

export const mapPhotos = (rows = []) =>
  rows.map((p) => ({ id: p.id, url: photoUrl(p.filename), thumbUrl: photoUrl(p.thumb), width: p.width, height: p.height }));

/** Resolve a UUID or human-readable key to the record's UUID, or 404. */
export async function resolveId(table, ref, client) {
  const run = client ? client.query.bind(client) : query;
  const sql = isUuid(ref) ? `SELECT id FROM ${table} WHERE id = $1` : `SELECT id FROM ${table} WHERE key = $1`;
  const { rows } = await run(sql, [ref]);
  if (!rows.length) throw notFound(`${LABEL[table] || 'Record'} not found`);
  return rows[0].id;
}

/** Turn a unique-violation on "key" into a friendly 409. */
export function friendlyDbError(err) {
  if (err.code === '23505' && /_key_key/.test(err.constraint || '')) {
    const e = badRequest('That key is already used by another record');
    e.status = 409;
    return e;
  }
  if (err.code === '23514' && err.constraint === 'value_range') {
    return badRequest('Low value cannot be more than the high value');
  }
  return err;
}

/** Build "col = $n" assignments for an UPDATE from a field→column map. */
export function assignments(data, cols, startAt = 1) {
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(cols)) {
    if (data[k] !== undefined) {
      vals.push(data[k]);
      sets.push(`${col} = $${startAt + vals.length - 1}`);
    }
  }
  return { sets, vals };
}

/** Process uploaded files and attach them to a record, after any existing photos. */
export async function addPhotos(table, id, files, client) {
  if (!files?.length) throw badRequest('Choose at least one photo');
  const col = OWNER[table];
  const written = [];
  const work = async (c) => {
    const { rows } = await c.query(`SELECT COALESCE(max(sort_order) + 1, 0) AS n FROM photos WHERE ${col} = $1`, [id]);
    let order = rows[0].n;
    for (const f of files) {
      const p = await processPhoto(f.buffer);
      written.push({ filename: p.filename, thumb_filename: p.thumbFilename });
      await c.query(
        `INSERT INTO photos (${col}, filename, thumb_filename, width, height, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, p.filename, p.thumbFilename, p.width, p.height, order++],
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
export async function reorderPhotos(table, id, ids) {
  const col = OWNER[table];
  if (!Array.isArray(ids)) throw badRequest('ids must be a list of photo ids');
  await tx(async (c) => {
    const { rows } = await c.query(`SELECT id FROM photos WHERE ${col} = $1`, [id]);
    const have = new Set(rows.map((r) => r.id));
    if (ids.length !== have.size || !ids.every((x) => have.has(x))) {
      throw badRequest('ids must list every photo of this record exactly once');
    }
    for (const [i, pid] of ids.entries()) await c.query('UPDATE photos SET sort_order = $1 WHERE id = $2', [i, pid]);
  });
}

/** Delete one photo; returns which record it belonged to. */
export async function deletePhoto(photoId) {
  const { rows } = await query(
    'DELETE FROM photos WHERE id = $1 RETURNING filename, thumb_filename, part_id, container_id, tossed_id',
    [photoId],
  );
  if (!rows.length) throw notFound('Photo not found');
  await removePhotoFiles(rows);
  const r = rows[0];
  return r.part_id ? ['parts', r.part_id] : r.container_id ? ['containers', r.container_id] : ['tossed', r.tossed_id];
}

/** Photo files of a record, captured before it is deleted (the rows cascade). */
export async function photoFilesOf(table, id, client) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(`SELECT filename, thumb_filename FROM photos WHERE ${OWNER[table]} = $1`, [id]);
  return rows;
}
