// Tasks, in four phases: 1 Before Driving, 2 Priority, 3 Non-Priority, 4 Performance.
// Each task can list the parts it needs.
import type { PoolClient } from 'pg';
import { query, runner, tx } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';
import type { IfMatch } from '../lib/preconditions.js';
import { resolveId, friendlyDbError, lockRef, softDelete, versionOf, uniqueKey } from './common.js';
import type { Task, TaskInput, TaskRow, TaskStep } from '../types.js';

const SELECT = `
  SELECT t.*,
    (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'key', p.key, 'label', p.label,
        'partNumber', p.part_number, 'status', p.status) ORDER BY tp.sort_order), '[]')
     FROM task_parts tp JOIN parts p ON p.id = tp.part_id WHERE tp.task_id = t.id AND p.deleted_at IS NULL) AS parts
  FROM tasks t`;

const toApi = (row: TaskRow): Task => ({
    id: row.id,
    key: row.key,
    title: row.title,
    phase: row.phase,
    notes: row.notes,
    steps: row.steps ?? [],
    done: row.done,
    doneAt: row.done_at,
    parts: row.parts,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
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
async function setParts(client: PoolClient, taskId: string, refs: string[]): Promise<void> {
    const ids: string[] = [];
    for (const ref of refs) {
        const { rows } = await client.query<{ id: string }>(
            `SELECT id FROM parts WHERE ${isUuid(ref) ? 'id' : 'key'} = $1 AND deleted_at IS NULL`,
            [ref],
        );
        if (!rows.length) throw badRequest(`Part not found: ${ref}`);
        if (!ids.includes(rows[0].id)) ids.push(rows[0].id);
    }
    await client.query('DELETE FROM task_parts WHERE task_id = $1', [taskId]);
    for (const [index, pid] of ids.entries()) {
        await client.query('INSERT INTO task_parts (task_id, part_id, sort_order) VALUES ($1, $2, $3)', [
            taskId,
            pid,
            index,
        ]);
    }
}

/** A task with steps is done exactly when all of its steps are; without steps, done is set directly. */
const doneFromSteps = (steps: TaskStep[]): boolean => steps.every((step) => step.done);

export async function createTask(data: TaskInput): Promise<Task> {
    try {
        return await tx(async (client) => {
            const key = data.key ?? (await uniqueKey(client, 'tasks', data.title ?? '', 'task'));
            const steps = data.steps ?? [];
            const isDone = steps.length ? doneFromSteps(steps) : (data.done ?? null);
            const { rows } = await client.query<{ id: string }>(
                `INSERT INTO tasks (key, title, phase, notes, steps, done, done_at)
       VALUES ($1, $2, COALESCE($3, 1), COALESCE($4, ''), $6::jsonb, COALESCE($5, false), CASE WHEN $5 THEN now() END)
       RETURNING id`,
                [key, data.title, data.phase ?? null, data.notes ?? null, isDone, JSON.stringify(steps)],
            );
            if (data.partIds) await setParts(client, rows[0].id, data.partIds);
            return getTask(rows[0].id, client);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

export async function updateTask(ref: string, data: TaskInput, im: IfMatch): Promise<Task> {
    try {
        return await tx(async (client) => {
            const id = await lockRef(client, 'tasks', ref, im, getTask);
            // With steps, done follows them: sent steps decide it, and done alone can't be changed.
            let isDone = data.done;
            if (data.steps?.length) isDone = doneFromSteps(data.steps);
            else if (data.steps === undefined && data.done !== undefined) {
                const { rows } = await client.query<{ steps: TaskStep[] }>('SELECT steps FROM tasks WHERE id = $1', [
                    id,
                ]);
                const current = rows[0]?.steps ?? [];
                if (current.length && data.done !== doneFromSteps(current)) {
                    throw badRequest("This task has steps; it's done when all of its steps are checked");
                }
            }
            await client.query(
                `UPDATE tasks SET
         key     = CASE WHEN $6 THEN $7 ELSE key END,
         title   = COALESCE($2, title),
         phase   = COALESCE($3, phase),
         notes   = COALESCE($4, notes),
         steps   = COALESCE($8::jsonb, steps),
         done    = COALESCE($5, done),
         done_at = CASE WHEN $5 IS NULL THEN done_at WHEN $5 THEN COALESCE(done_at, now()) ELSE NULL END,
         updated_at = now()
       WHERE id = $1`,
                [
                    id,
                    data.title ?? null,
                    data.phase ?? null,
                    data.notes ?? null,
                    isDone ?? null,
                    data.key !== undefined,
                    data.key ?? null,
                    data.steps ? JSON.stringify(data.steps) : null,
                ],
            );
            if (data.partIds) await setParts(client, id, data.partIds);
            return getTask(id, client);
        });
    } catch (err) {
        throw friendlyDbError(err);
    }
}

/** Soft-delete a task (the parts it used are not affected). Returns the new version. */
export async function deleteTask(ref: string, im: IfMatch): Promise<number> {
    return tx(async (client) => {
        const id = await lockRef(client, 'tasks', ref, im, getTask);
        await softDelete(client, 'tasks', id);
        return versionOf(client, 'tasks', id);
    });
}
