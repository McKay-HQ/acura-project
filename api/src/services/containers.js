// Containers: the boxes and bins parts are stored in. A top-level container can hold
// sub-containers (one level deep), e.g. "Body / Trim" holds "Large Trim" and "Small Trim".
import { query, tx } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { removePhotoFiles } from '../lib/photos.js';
import { photosJson, mapPhotos, resolveId, friendlyDbError, assignments, addPhotos, photoFilesOf } from './common.js';

const COLS = {
  key: 'key', name: 'name', location: 'location', notes: 'notes',
  parentId: 'parent_id', icon: 'icon', sortOrder: 'sort_order',
};

const SELECT = `
  SELECT x.*, ${photosJson('containers', 'x')},
    (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'key', p.key, 'label', p.label, 'status', p.status)
       ORDER BY p.label), '[]') FROM parts p WHERE p.container_id = x.id) AS parts
  FROM containers x`;

const toApi = (r) => ({
  id: r.id,
  key: r.key,
  name: r.name,
  location: r.location,
  notes: r.notes,
  parentId: r.parent_id,
  icon: r.icon,
  sortOrder: r.sort_order,
  photos: mapPhotos(r.photos),
  parts: r.parts, // parts directly in this container (not its sub-containers)
  partCount: r.parts.length,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** All containers, top-level and sub, in display order. */
export async function listContainers() {
  const { rows } = await query(`${SELECT} ORDER BY x.sort_order, x.created_at, x.id`);
  return rows.map(toApi);
}

export async function getContainer(ref, client) {
  const run = client ? client.query.bind(client) : query;
  const id = await resolveId('containers', ref, client);
  const { rows } = await run(`${SELECT} WHERE x.id = $1`, [id]);
  return toApi(rows[0]);
}

/** Resolve parentId and keep nesting one level deep. */
async function checkParent(data, selfId, client) {
  if (!data.parentId) return data;
  const run = client ? client.query.bind(client) : query;
  data.parentId = await resolveId('containers', data.parentId, client);
  if (selfId && data.parentId === selfId) throw badRequest('A container cannot be inside itself');
  const { rows } = await run('SELECT parent_id FROM containers WHERE id = $1', [data.parentId]);
  if (rows[0]?.parent_id) throw badRequest('Sub-containers can only go inside a top-level container');
  if (selfId) {
    const kids = await run('SELECT 1 FROM containers WHERE parent_id = $1 LIMIT 1', [selfId]);
    if (kids.rowCount) throw badRequest('This container has sub-containers, so it must stay top-level');
  }
  return data;
}

export async function createContainer(data, files) {
  try {
    return await tx(async (c) => {
      await checkParent(data, null, c);
      const cols = Object.keys(COLS).filter((k) => data[k] !== undefined);
      const { rows } = await c.query(
        `INSERT INTO containers (${cols.map((k) => COLS[k]).join(', ')})
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        cols.map((k) => data[k]),
      );
      if (files?.length) await addPhotos('containers', rows[0].id, files, c);
      return getContainer(rows[0].id, c);
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateContainer(ref, data) {
  const id = await resolveId('containers', ref);
  await checkParent(data, id);
  const { sets, vals } = assignments(data, COLS, 2);
  if (sets.length) {
    try {
      await query(`UPDATE containers SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...vals]);
    } catch (err) {
      throw friendlyDbError(err);
    }
  }
  return getContainer(id);
}

/**
 * Delete a container.
 * - A sub-container: its parts move up to the parent container.
 * - A top-level container: its sub-containers become top-level; its own parts are left unassigned.
 */
export async function deleteContainer(ref) {
  const id = await resolveId('containers', ref);
  const files = await photoFilesOf('containers', id);
  await tx(async (c) => {
    const { rows } = await c.query('SELECT parent_id FROM containers WHERE id = $1', [id]);
    if (rows[0]?.parent_id) await c.query('UPDATE parts SET container_id = $1 WHERE container_id = $2', [rows[0].parent_id, id]);
    await c.query('DELETE FROM containers WHERE id = $1', [id]);
  });
  await removePhotoFiles(files);
}
