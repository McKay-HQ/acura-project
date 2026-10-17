// One-time fill-ins for databases created by earlier versions of the API. Each runs once (app_meta records it).
//
// backfillPhotoSources: photos.source for databases seeded before sources were recorded.
// Matches each record's photos, in display order, to the files the starter data gave it at the time
// (seed/history/2026-10-12-photos.json). Records whose photos changed since are left alone; bin/sync
// replaces those. Runs once: app_meta records it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from './db.js';
import { OWNER, uniqueKey } from './services/common.js';
import type { PhotoTable, SeedFile } from './types.js';

const seedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed');
const historyFile = path.join(seedDir, 'history/2026-10-12-photos.json');
const FLAG = 'photo_sources_backfilled';
const TABLES: PhotoTable[] = ['containers', 'parts', 'tossed'];

type History = Partial<Record<PhotoTable, Record<string, string[]>>>;

export async function backfillPhotoSources(): Promise<void> {
    const done = await pool.query(`SELECT 1 FROM app_meta WHERE key = $1`, [FLAG]);
    if (done.rowCount) return;
    const history = JSON.parse(await fs.readFile(historyFile, 'utf8')) as History;
    let filled = 0;
    await tx(async (client) => {
        // Recording a source isn't an edit, so don't bump the owning records' versions.
        await client.query(`SET LOCAL app.no_bump = 'on'`);
        for (const table of TABLES) {
            for (const [key, files] of Object.entries(history[table] ?? {})) {
                const { rows } = await client.query<{ id: string; source: string | null }>(
                    `SELECT p.id, p.source FROM photos p JOIN ${table} r ON p.${OWNER[table]} = r.id
                     WHERE r.key = $1 ORDER BY p.sort_order, p.created_at`,
                    [key],
                );
                if (rows.length !== files.length || rows.some((row) => row.source !== null)) continue;
                for (const [index, row] of rows.entries()) {
                    await client.query(`UPDATE photos SET source = $1 WHERE id = $2`, [files[index], row.id]);
                    filled++;
                }
            }
        }
        await client.query(`INSERT INTO app_meta (key, value) VALUES ($1, $2)`, [FLAG, `${filled} photos`]);
    });
    if (filled) console.log(`Recorded the source of ${filled} existing photos.`);
    await nameUnsourcedPhotos();
}

/** Any photo still without a source is named after itself, so every photo has a stable, unique name. */
async function nameUnsourcedPhotos(): Promise<void> {
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
