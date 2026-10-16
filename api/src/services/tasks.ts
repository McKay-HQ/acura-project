// Tasks, in four phases: 1 Before Driving, 2 Priority, 3 Non-Priority, 4 Performance.
// Each task can list the parts it needs.
import type { PoolClient } from 'pg';
import { query, runner, tx } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';
import type { IfMatch } from '../lib/preconditions.js';
import { resolveId, friendlyDbError, lockRef, softDelete, versionOf, uniqueKey } from './common.js';
import type { Task, TaskInput, TaskRow } from '../types.js';

const SELECT = `
  SELECT t.*,
    (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'key', p.key, 'label', p.label,
        'partNumber', p.part_number, 'status', p.status) ORDER BY tp.sort_order), '[]')
     FROM task_parts tp JOIN parts p ON p.id = tp.part_id WHERE tp.task_id = t.id AND p.deleted_at IS NULL) AS parts
  FROM tasks t`;

const toApi = (r: TaskRow): Task => ({
    id: r.id,
    key: r.key,
    title: r.title,
    phase: r.phase,
    notes: r.notes,
    done: r.done,
    doneAt: r.done_at,
    parts: r.parts,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
});

// By phase, open tasks first within a phase, then oldest first. Deleted tasks (tombstones) only with includeDeleted.
export async function listTasks(includeDeleted = false): Promise<Task[]> {
    const where = includeDeleted ? '' : 'WHERE t.deleted_at IS NULL';
    const { rows } = await query<TaskRow>(`${SELECT} ${where} ORDER BY t.phase, t.done, t.created_at, t.id`);
    return rows.map(toApi);
}

/** A task by UUID or key. */
export async function getTask(ref: string, client?: PoolClient): Promise<Task> {
    const id = await resolveId('tasks', ref, client);
    const { rows } = await runner(client)<TaskRow>(`${SELECT} WHERE t.id = $1`, [id]);
    return toApi(rows[0]);
}

/** Replace a task's part list. Accepts part UUIDs or keys of parts that are not deleted. */
async function setParts(c: PoolClient, taskId: string, refs: string[]): Promise<void> {
    const ids: string[] = [];
    for (const ref of refs) {
        const { rows } = await c.query<{ id: string }>(
            `SELECT id FROM parts WHERE ${isUuid(ref) ? 'id' : 'key'} = $1 AND deleted_at IS NULL`,
            [ref],
        );
        if (!rows.length) throw badRequest(`Part not found: ${ref}`);
        if (!ids.includes(rows[0].id)) ids.push(rows[0].id);
    }
    await c.query('DELETE FROM task_parts WHERE task_id = $1', [taskId]);
    for (const [i, pid] of ids.entries()) {
        await c.query('INSERT INTO task_parts (task_id, part_id, sort_order) VALUES ($1, $2, $3)', [taskId, pid, i]);
    }
}

export async function createTask(d: TaskInput): Promise<Task> {
    try {
        return await tx(async (c) => {
            const key = d.key ?? (await uniqueKey(c, 'tasks', d.title ?? '', 'task'));
            const { rows } = await c.query<{ id: string }>(
                `INSERT INTO tasks (key, title, phase, notes, done, done_at)
       VALUES ($1, $2, COALESCE($3, 1), COALESCE($4, ''), COALESCE($5, false), CASE WHEN $5 THEN now() END)
       RETURNING id`,
                [key, d.title, d.phase ?? null, d.notes ?? null, d.done ?? null],
            );
            if (d.partIds) await setParts(c, rows[0].id, d.partIds);
            return getTask(rows[0].id, c);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

export async function updateTask(ref: string, d: TaskInput, im: IfMatch): Promise<Task> {
    try {
        return await tx(async (c) => {
            const id = await lockRef(c, 'tasks', ref, im, getTask);
            await c.query(
                `UPDATE tasks SET
         key     = CASE WHEN $6 THEN $7 ELSE key END,
         title   = COALESCE($2, title),
         phase   = COALESCE($3, phase),
         notes   = COALESCE($4, notes),
         done    = COALESCE($5, done),
         done_at = CASE WHEN $5 IS NULL THEN done_at WHEN $5 THEN COALESCE(done_at, now()) ELSE NULL END,
         updated_at = now()
       WHERE id = $1`,
                [
                    id,
                    d.title ?? null,
                    d.phase ?? null,
                    d.notes ?? null,
                    d.done ?? null,
                    d.key !== undefined,
                    d.key ?? null,
                ],
            );
            if (d.partIds) await setParts(c, id, d.partIds);
            return getTask(id, c);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

/** Soft-delete a task (the parts it used are not affected). Returns the new version. */
export async function deleteTask(ref: string, im: IfMatch): Promise<number> {
    return tx(async (c) => {
        const id = await lockRef(c, 'tasks', ref, im, getTask);
        await softDelete(c, 'tasks', id);
        return versionOf(c, 'tasks', id);
    });
}
