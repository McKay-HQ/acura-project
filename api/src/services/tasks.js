// Tasks, in four phases: 1 Before Driving, 2 Priority, 3 Non-Priority, 4 Performance.
// Each task can list the parts it needs.
import { query, tx } from '../db.js';
import { notFound, badRequest } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

const SELECT = `
  SELECT t.*,
    (SELECT COALESCE(json_agg(json_build_object('id', p.id, 'key', p.key, 'label', p.label,
        'partNumber', p.part_number, 'status', p.status) ORDER BY tp.sort_order), '[]')
     FROM task_parts tp JOIN parts p ON p.id = tp.part_id WHERE tp.task_id = t.id) AS parts
  FROM tasks t`;

const toApi = (r) => ({
  id: r.id,
  title: r.title,
  phase: r.phase,
  notes: r.notes,
  done: r.done,
  doneAt: r.done_at,
  parts: r.parts,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// By phase, open tasks first within a phase, then oldest first.
export async function listTasks() {
  const { rows } = await query(`${SELECT} ORDER BY t.phase, t.done, t.created_at, t.id`);
  return rows.map(toApi);
}

export async function getTask(id, client) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(`${SELECT} WHERE t.id = $1`, [id]);
  if (!rows.length) throw notFound('Task not found');
  return toApi(rows[0]);
}

/** Replace a task's part list. Accepts part UUIDs or keys. */
async function setParts(c, taskId, refs) {
  const ids = [];
  for (const ref of refs) {
    const { rows } = await c.query(
      isUuid(ref) ? 'SELECT id FROM parts WHERE id = $1' : 'SELECT id FROM parts WHERE key = $1', [ref],
    );
    if (!rows.length) throw badRequest(`Part not found: ${ref}`);
    if (!ids.includes(rows[0].id)) ids.push(rows[0].id);
  }
  await c.query('DELETE FROM task_parts WHERE task_id = $1', [taskId]);
  for (const [i, pid] of ids.entries()) {
    await c.query('INSERT INTO task_parts (task_id, part_id, sort_order) VALUES ($1, $2, $3)', [taskId, pid, i]);
  }
}

export async function createTask(d) {
  return tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO tasks (title, phase, notes, done, done_at)
       VALUES ($1, COALESCE($2, 1), COALESCE($3, ''), COALESCE($4, false), CASE WHEN $4 THEN now() END)
       RETURNING id`,
      [d.title, d.phase ?? null, d.notes ?? null, d.done ?? null],
    );
    if (d.partIds) await setParts(c, rows[0].id, d.partIds);
    return getTask(rows[0].id, c);
  });
}

export async function updateTask(id, d) {
  return tx(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE tasks SET
         title   = COALESCE($2, title),
         phase   = COALESCE($3, phase),
         notes   = COALESCE($4, notes),
         done    = COALESCE($5, done),
         done_at = CASE WHEN $5 IS NULL THEN done_at WHEN $5 THEN COALESCE(done_at, now()) ELSE NULL END,
         updated_at = now()
       WHERE id = $1`,
      [id, d.title ?? null, d.phase ?? null, d.notes ?? null, d.done ?? null],
    );
    if (!rowCount) throw notFound('Task not found');
    if (d.partIds) await setParts(c, id, d.partIds);
    return getTask(id, c);
  });
}

export async function deleteTask(id) {
  const { rowCount } = await query('DELETE FROM tasks WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Task not found');
}
