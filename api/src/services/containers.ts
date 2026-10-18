// Containers: the boxes and bins parts are stored in. A top-level container can hold
// sub-containers (one level deep), e.g. "Body / Trim" holds "Large Trim" and "Small Trim".
import type { PoolClient } from 'pg';
import { query, runner, tx } from '../db.js';
import { badRequest } from '../lib/errors.js';
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
import type { Container, ContainerInput, ContainerRow } from '../types.js';

const COLS: ColumnMap<ContainerInput> = {
    key: 'key',
    name: 'name',
    location: 'location',
    notes: 'notes',
    parentId: 'parent_id',
    icon: 'icon',
    sortOrder: 'sort_order',
};

const SELECT = `
  SELECT x.*, ${photosJson('containers', 'x')},
    (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'key', p.key, 'label', p.label, 'status', p.status)
       ORDER BY p.label), '[]') FROM parts p WHERE p.container_id = x.id AND p.deleted_at IS NULL) AS parts
  FROM containers x`;

const toApi = (row: ContainerRow): Container => ({
    id: row.id,
    key: row.key,
    name: row.name,
    location: row.location,
    notes: row.notes,
    parentId: row.parent_id,
    icon: row.icon,
    sortOrder: row.sort_order,
    photos: mapPhotos(row.photos),
    parts: row.parts, // parts directly in this container (not its sub-containers)
    partCount: row.parts.length,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
});

/** All containers, top-level and sub, in display order; deleted ones (tombstones) are left out. */
export async function listContainers(): Promise<Container[]> {
    const { rows } = await query<ContainerRow>(
        `${SELECT} WHERE x.deleted_at IS NULL ORDER BY x.sort_order, x.created_at, x.id`,
    );
    return rows.map(toApi);
}

export async function getContainer(ref: string, client?: PoolClient): Promise<Container> {
    const run = runner(client);
    const id = await resolveId('containers', ref, client);
    const { rows } = await run<ContainerRow>(`${SELECT} WHERE x.id = $1`, [id]);
    return toApi(rows[0]);
}

/** Resolve parentId and keep nesting one level deep. */
async function checkParent(data: ContainerInput, selfId: string | null, client?: PoolClient): Promise<ContainerInput> {
    if (!data.parentId) return data;
    const run = runner(client);
    data.parentId = await resolveId('containers', data.parentId, client);
    if (selfId && data.parentId === selfId) throw badRequest('A container cannot be inside itself');
    const { rows } = await run<{ parent_id: string | null }>('SELECT parent_id FROM containers WHERE id = $1', [
        data.parentId,
    ]);
    if (rows[0]?.parent_id) throw badRequest('Sub-containers can only go inside a top-level container');
    if (selfId) {
        const kids = await run('SELECT 1 FROM containers WHERE parent_id = $1 AND deleted_at IS NULL LIMIT 1', [
            selfId,
        ]);
        if (kids.rowCount) throw badRequest('This container has sub-containers, so it must stay top-level');
    }
    return data;
}

export async function createContainer(data: ContainerInput, files?: Express.Multer.File[]): Promise<Container> {
    try {
        return await tx(async (client) => {
            await checkParent(data, null, client);
            if (data.key == null) data.key = await uniqueKey(client, 'containers', data.name ?? '', 'container');
            // Object.keys widens the keys to string; they are exactly the keys of ContainerInput.
            const cols = (Object.keys(COLS) as (keyof ContainerInput)[]).filter((field) => data[field] !== undefined);
            const { rows } = await client.query<{ id: string }>(
                `INSERT INTO containers (${cols.map((field) => COLS[field]).join(', ')})
         VALUES (${cols.map((_field, index) => `$${index + 1}`).join(', ')}) RETURNING id`,
                cols.map((field) => data[field]),
            );
            if (files?.length) await addPhotos('containers', rows[0].id, files, client);
            return getContainer(rows[0].id, client);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

export async function updateContainer(ref: string, data: ContainerInput, im: IfMatch): Promise<Container> {
    try {
        return await tx(async (client) => {
            const id = await lockRef(client, 'containers', ref, im, getContainer);
            await checkParent(data, id, client);
            const { sets, vals } = assignments(data, COLS, 2);
            if (sets.length)
                await client.query(`UPDATE containers SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [
                    id,
                    ...vals,
                ]);
            return getContainer(id, client);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

/**
 * Soft-delete a container (its photos are removed). Returns the new version.
 * - A sub-container: its parts move up to the parent container.
 * - A top-level container: its sub-containers become top-level; its own parts are left unassigned.
 * The parts and sub-containers that change get new versions too.
 */
export async function deleteContainer(ref: string, im: IfMatch): Promise<number> {
    const { version, files } = await tx(async (client) => {
        const id = await lockRef(client, 'containers', ref, im, getContainer);
        const { rows } = await client.query<{ parent_id: string | null }>(
            'SELECT parent_id FROM containers WHERE id = $1',
            [id],
        );
        const parent = rows[0].parent_id;
        await softDelete(client, 'containers', id);
        await client.query(
            'UPDATE parts SET container_id = $1, updated_at = now() WHERE container_id = $2 AND deleted_at IS NULL',
            [parent, id],
        );
        if (!parent)
            await client.query(
                'UPDATE containers SET parent_id = NULL, updated_at = now() WHERE parent_id = $1 AND deleted_at IS NULL',
                [id],
            );
        const files = await deleteRecordPhotos(client, 'containers', id);
        return { version: await versionOf(client, 'containers', id), files };
    });
    await removePhotoFiles(files);
    return version;
}
