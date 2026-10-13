// Parts: everything kept, spare, for sale or still unknown.
import type { PoolClient } from 'pg';
import { query, runner, tx } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { removePhotoFiles } from '../lib/photos.js';
import { STATUSES } from '../lib/validate.js';
import { photosJson, mapPhotos, resolveId, friendlyDbError, assignments, addPhotos, photoFilesOf } from './common.js';
import type { ColumnMap } from './common.js';
import type { Part, PartFilters, PartInput, PartRow, PartStatus, TagCount, TossedInput } from '../types.js';

const COLS: ColumnMap<PartInput> = {
    key: 'key',
    label: 'label',
    partNumber: 'part_number',
    fits: 'fits',
    status: 'status',
    tags: 'tags',
    valueLow: 'value_low',
    valueHigh: 'value_high',
    notes: 'notes',
    containerId: 'container_id',
};

const SELECT = `
  SELECT x.*, c.name AS container_name, c.key AS container_key, c.parent_id AS container_parent_id,
    pc.name AS parent_name, pc.key AS parent_key, pc.icon AS parent_icon, c.icon AS container_icon,
    (SELECT COALESCE(json_agg(json_build_object('id', t.id, 'title', t.title, 'phase', t.phase, 'done', t.done)
       ORDER BY t.phase, t.created_at), '[]')
     FROM task_parts tp JOIN tasks t ON t.id = tp.task_id WHERE tp.part_id = x.id) AS tasks,
    ${photosJson('parts', 'x')}
  FROM parts x
  LEFT JOIN containers c ON c.id = x.container_id
  LEFT JOIN containers pc ON pc.id = c.parent_id`;

function toApi(r: PartRow): Part {
    return {
        id: r.id,
        key: r.key,
        label: r.label,
        partNumber: r.part_number,
        fits: r.fits,
        status: r.status,
        tags: r.tags,
        valueLow: r.value_low,
        valueHigh: r.value_high,
        notes: r.notes,
        // The container the part is in. For a sub-container, `top` is the parent it sits inside.
        container: r.container_id
            ? {
                  id: r.container_id,
                  key: r.container_key,
                  name: r.container_name,
                  icon: r.container_icon,
                  top: r.container_parent_id
                      ? { id: r.container_parent_id, key: r.parent_key, name: r.parent_name, icon: r.parent_icon }
                      : { id: r.container_id, key: r.container_key, name: r.container_name, icon: r.container_icon },
              }
            : null,
        tasks: r.tasks,
        // Phase tags come from the open tasks that use this part, e.g. "Phase 1".
        phaseTags: [...new Set(r.tasks.filter((t) => !t.done).map((t) => `Phase ${t.phase}`))].sort(),
        photos: mapPhotos(r.photos),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}

/**
 * List parts. Filters (all optional, combined with AND):
 *   status     one or more of Verified / Unverified / Unknown (any of them)
 *   tag        one or more tags (part has ANY of them); "Other cars" = fits is set and not RSX;
 *              "Phase 1".."Phase 4" = used by an open task in that phase
 *   fits       one or more fits values (any of them)
 *   container  container id or key (includes its sub-containers), or "none" for parts not in a container
 *   q          text search in name, part number, notes and tags
 */
export async function listParts({ status, tag, fits, container, q }: PartFilters = {}): Promise<Part[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const list = (v: unknown): string[] =>
        v == null
            ? []
            : (Array.isArray(v) ? (v as unknown[]) : [v])
                  .flatMap((s) => String(s).split(','))
                  .map((s) => s.trim())
                  .filter(Boolean);

    const st = list(status);
    if (st.length) {
        if (st.some((s) => !STATUSES.includes(s as PartStatus)))
            throw badRequest(`status must be one of: ${STATUSES.join(', ')}`);
        params.push(st);
        where.push(`x.status = ANY($${params.length})`);
    }
    const tags = list(tag);
    if (tags.length) {
        const ors: string[] = [];
        const phases = tags
            .map((t) => /^Phase ([1-4])$/.exec(t)?.[1])
            .filter(Boolean)
            .map(Number);
        const plain = tags.filter((t) => t !== 'Other cars' && !/^Phase [1-4]$/.test(t));
        if (phases.length) {
            params.push(phases);
            ors.push(`EXISTS (SELECT 1 FROM task_parts tp JOIN tasks t ON t.id = tp.task_id
        WHERE tp.part_id = x.id AND NOT t.done AND t.phase = ANY($${params.length}::smallint[]))`);
        }
        if (plain.length) {
            params.push(plain);
            ors.push(`x.tags && $${params.length}::text[]`);
        }
        if (tags.includes('Other cars')) ors.push(`(x.fits <> '' AND x.fits <> 'RSX')`);
        where.push(`(${ors.join(' OR ')})`);
    }
    const fitsList = list(fits);
    if (fitsList.length) {
        params.push(fitsList);
        where.push(`x.fits = ANY($${params.length})`);
    }
    if (container) {
        if (container === 'none') where.push('x.container_id IS NULL');
        else {
            // A query-string value; passed through unchanged, exactly as before the TypeScript conversion.
            params.push(await resolveId('containers', container as string));
            const n = params.length;
            where.push(
                `(x.container_id = $${n} OR x.container_id IN (SELECT id FROM containers WHERE parent_id = $${n}))`,
            );
        }
    }
    if (q && String(q).trim()) {
        params.push(`%${String(q).trim()}%`);
        const n = params.length;
        where.push(
            `(x.label ILIKE $${n} OR x.part_number ILIKE $${n} OR x.notes ILIKE $${n} OR array_to_string(x.tags, ' ') ILIKE $${n})`,
        );
    }
    const { rows } = await query<PartRow>(
        `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY x.created_at, x.id`,
        params,
    );
    return rows.map(toApi);
}

export async function getPart(ref: string, client?: PoolClient): Promise<Part> {
    const run = runner(client);
    const id = await resolveId('parts', ref, client);
    const { rows } = await run<PartRow>(`${SELECT} WHERE x.id = $1`, [id]);
    return toApi(rows[0]);
}

async function withContainerId(data: PartInput, client?: PoolClient): Promise<PartInput> {
    if (data.containerId) data.containerId = await resolveId('containers', data.containerId, client);
    return data;
}

export async function createPart(data: PartInput, files?: Express.Multer.File[]): Promise<Part> {
    try {
        return await tx(async (c) => {
            await withContainerId(data, c);
            const cols: string[] = [];
            const vals: unknown[] = [];
            // Object.entries widens the keys to string; they are exactly the keys of PartInput.
            for (const [k, col] of Object.entries(COLS) as [keyof PartInput, string][]) {
                if (data[k] !== undefined) {
                    cols.push(col);
                    vals.push(data[k]);
                }
            }
            const { rows } = await c.query<{ id: string }>(
                `INSERT INTO parts (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
                vals,
            );
            if (files?.length) await addPhotos('parts', rows[0].id, files, c);
            return getPart(rows[0].id, c);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

export async function updatePart(ref: string, data: PartInput): Promise<Part> {
    const id = await resolveId('parts', ref);
    await withContainerId(data);
    const { sets, vals } = assignments(data, COLS, 2);
    if (!sets.length) return getPart(id);
    try {
        await query(`UPDATE parts SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...vals]);
    } catch (err) {
        throw friendlyDbError(err);
    }
    return getPart(id);
}

export async function deletePart(ref: string): Promise<void> {
    const id = await resolveId('parts', ref);
    const files = await photoFilesOf('parts', id);
    await query('DELETE FROM parts WHERE id = $1', [id]);
    await removePhotoFiles(files);
}

/**
 * Toss a part: create a tossed record with the part's name, number and photos,
 * then delete the part. Photos move over without being re-processed.
 */
export async function tossPart(ref: string, { reason = '', tossedOn = null }: TossedInput = {}): Promise<string> {
    const id = await resolveId('parts', ref);
    return tx(async (c) => {
        const { rows } = await c.query<Pick<PartRow, 'key' | 'label' | 'part_number'>>(
            'SELECT key, label, part_number FROM parts WHERE id = $1',
            [id],
        );
        const p = rows[0];
        const { rows: t } = await c.query<{ id: string }>(
            `INSERT INTO tossed (key, label, part_number, reason, tossed_on, sort_order)
       VALUES (CASE WHEN EXISTS (SELECT 1 FROM tossed WHERE key = $1) THEN NULL ELSE $1 END,
               $2, $3, $4, COALESCE($5::date, CURRENT_DATE), (SELECT COALESCE(max(sort_order) + 1, 0) FROM tossed))
       RETURNING id`,
            [p.key, p.label, p.part_number, reason, tossedOn],
        );
        await c.query('UPDATE photos SET part_id = NULL, tossed_id = $1 WHERE part_id = $2', [t[0].id, id]);
        await c.query('DELETE FROM parts WHERE id = $1', [id]);
        return t[0].id;
    });
}

/** Distinct tags in use (including task phase tags), with how many parts have each. */
export async function listTags(): Promise<TagCount[]> {
    const { rows } = await query<TagCount>(`
    SELECT tag, count(*)::int AS count FROM (
      SELECT x.id, t AS tag FROM parts x, unnest(x.tags) AS t
      UNION
      SELECT tp.part_id, 'Phase ' || tk.phase FROM task_parts tp JOIN tasks tk ON tk.id = tp.task_id WHERE NOT tk.done
    ) s GROUP BY tag ORDER BY count DESC, tag`);
    return rows;
}
