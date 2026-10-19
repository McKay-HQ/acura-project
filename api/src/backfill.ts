// Fill-ins for databases created by earlier versions of the API.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from './db.js';
import { uniqueKey } from './services/common.js';
import type { SeedFile } from './types.js';

const seedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed');

/**
 * Any photo still without a source (from before sources were recorded) is named after itself, so every photo has a
 * stable, unique name. Cheap once there are none left, so it runs on every start.
 */
export async function nameUnsourcedPhotos(): Promise<void> {
    const rowCount = await tx(async (client) => {
        await client.query(`SET LOCAL app.no_bump = 'on'`);
        const result = await client.query(`UPDATE photos SET source = id::text || '.jpg' WHERE source IS NULL`);
        return result.rowCount ?? 0;
    });
    if (rowCount) console.log(`Named ${rowCount} photos without a source.`);
}

const TASK_KEYS_FLAG = 'task_keys_backfilled';

/**
 * Give every task a key, for databases created before tasks had keys: first the key seed/seed.json gives the task
 * with the same title (when that key is still free), then a key generated from the title for any task still
 * without one. Versions are not bumped: the tasks have not changed for the user.
 */
export async function backfillTaskKeys(): Promise<void> {
    const done = await pool.query(`SELECT 1 FROM app_meta WHERE key = $1`, [TASK_KEYS_FLAG]);
    if (done.rowCount) return;
    let seedTasks: SeedFile['tasks'] = [];
    try {
        seedTasks = (JSON.parse(await fs.readFile(path.join(seedDir, 'seed.json'), 'utf8')) as SeedFile).tasks;
    } catch {
        // No seed file: only generated keys.
    }
    let matched = 0;
    let generated = 0;
    await tx(async (client) => {
        await client.query(`SET LOCAL app.no_bump = 'on'`);
        for (const task of seedTasks ?? []) {
            if (!task.key) continue;
            const result = await client.query(
                `UPDATE tasks SET key = $1
                 WHERE id = (SELECT id FROM tasks WHERE key IS NULL AND title = $2 ORDER BY created_at, id LIMIT 1)
                   AND NOT EXISTS (SELECT 1 FROM tasks WHERE key = $1)`,
                [task.key, task.title],
            );
            matched += result.rowCount ?? 0;
        }
        const { rows } = await client.query<{ id: string; title: string }>(
            `SELECT id, title FROM tasks WHERE key IS NULL ORDER BY created_at, id`,
        );
        for (const row of rows) {
            await client.query(`UPDATE tasks SET key = $1 WHERE id = $2`, [
                await uniqueKey(client, 'tasks', row.title, 'task'),
                row.id,
            ]);
            generated++;
        }
        await client.query(`INSERT INTO app_meta (key, value) VALUES ($1, $2)`, [
            TASK_KEYS_FLAG,
            `${matched} from seed.json, ${generated} generated`,
        ]);
    });
    if (matched || generated) console.log(`Set task keys: ${matched} from seed.json, ${generated} generated.`);
}
