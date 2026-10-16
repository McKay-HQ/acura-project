// One-time fill-in of photos.source for databases seeded before sources were recorded.
// Matches each record's photos, in display order, to the files the starter data gave it at the time
// (seed/history/2026-10-12-photos.json). Records whose photos changed since are left alone; bin/sync
// replaces those. Runs once: app_meta records it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from './db.js';
import { OWNER } from './services/common.js';
import type { PhotoTable } from './types.js';

const historyFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../seed/history/2026-10-12-photos.json',
);
const FLAG = 'photo_sources_backfilled';
const TABLES: PhotoTable[] = ['containers', 'parts', 'tossed'];

type History = Partial<Record<PhotoTable, Record<string, string[]>>>;

export async function backfillPhotoSources(): Promise<void> {
    const done = await pool.query(`SELECT 1 FROM app_meta WHERE key = $1`, [FLAG]);
    if (done.rowCount) return;
    const history = JSON.parse(await fs.readFile(historyFile, 'utf8')) as History;
    let filled = 0;
    await tx(async (c) => {
        for (const table of TABLES) {
            for (const [key, files] of Object.entries(history[table] ?? {})) {
                const { rows } = await c.query<{ id: string; source: string | null }>(
                    `SELECT p.id, p.source FROM photos p JOIN ${table} r ON p.${OWNER[table]} = r.id
                     WHERE r.key = $1 ORDER BY p.sort_order, p.created_at`,
                    [key],
                );
                if (rows.length !== files.length || rows.some((r) => r.source !== null)) continue;
                for (const [i, r] of rows.entries()) {
                    await c.query(`UPDATE photos SET source = $1 WHERE id = $2`, [files[i], r.id]);
                    filled++;
                }
            }
        }
        await c.query(`INSERT INTO app_meta (key, value) VALUES ($1, $2)`, [FLAG, `${filled} photos`]);
    });
    if (filled) console.log(`Recorded the source of ${filled} existing photos.`);
}
