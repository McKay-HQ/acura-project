// One-time import of seed/seed.json, a starter snapshot of the inventory; it isn't kept up to date with the app.
// Runs only against an empty database, and only once: app_meta records it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { pool, tx } from './db.js';
import crypto from 'node:crypto';
import { processPhoto, removePhotoFiles } from './lib/photos.js';
import { photoSource } from './services/common.js';
import type { PhotoFileRow, SeedFile } from './types.js';

// Resolves to api/seed from both src/ (tsx) and dist/ (compiled).
const seedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed');

export async function seedIfEmpty(): Promise<void> {
    const already = await pool.query(`SELECT 1 FROM app_meta WHERE key = 'seeded'`);
    if (already.rowCount) return;
    // count(*) is bigint, which pg returns as a string.
    const { rows } = await pool.query<{ n: string }>(`SELECT
    (SELECT count(*) FROM parts) + (SELECT count(*) FROM containers) + (SELECT count(*) FROM tossed)
    + (SELECT count(*) FROM tasks) + (SELECT count(*) FROM notes) AS n`);
    if (Number(rows[0].n) > 0) {
        await pool.query(`INSERT INTO app_meta (key, value) VALUES ('seeded', 'skipped: data present')`);
        return;
    }

    let seed: SeedFile;
    try {
        seed = JSON.parse(await fs.readFile(path.join(seedDir, 'seed.json'), 'utf8')) as SeedFile;
    } catch {
        console.log('No seed file found; starting empty.');
        return;
    }

    const written: PhotoFileRow[] = [];
    async function photos(client: PoolClient, col: string, id: string, names: string[] = []): Promise<void> {
        let order = 0;
        for (const name of names) {
            const buf = await fs.readFile(path.join(seedDir, 'photos', path.basename(name)));
            const photo = await processPhoto(buf);
            written.push({ filename: photo.filename, thumb_filename: photo.thumbFilename });
            const photoId = crypto.randomUUID();
            await client.query(
                `INSERT INTO photos (id, ${col}, filename, thumb_filename, width, height, sort_order, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    photoId,
                    id,
                    photo.filename,
                    photo.thumbFilename,
                    photo.width,
                    photo.height,
                    order++,
                    photoSource(name, photoId),
                ],
            );
        }
    }
    const ts = (value: string | null | undefined): string | null => value || null;

    console.log('Importing starter inventory (this processes every photo; give it a minute)…');
    try {
        await tx(async (client) => {
            const boxIds: Record<string, string> = {};
            // Top-level containers first, so sub-containers can point at their parent.
            const boxes = [...(seed.containers || [])].sort(
                (left, right) => Number(Boolean(left.parent)) - Number(Boolean(right.parent)),
            );
            for (const box of boxes) {
                const result = await client.query<{ id: string }>(
                    `INSERT INTO containers (key, name, location, notes, parent_id, icon, sort_order, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, now())) RETURNING id`,
                    [
                        box.key || null,
                        box.name,
                        box.location || '',
                        box.notes || '',
                        box.parent ? (boxIds[box.parent] ?? null) : null,
                        box.icon || 'box',
                        box.order ?? 0,
                        ts(box.createdAt),
                    ],
                );
                // String() matches JS property-key conversion, so a missing key is stored under "undefined" as before.
                boxIds[String(box.key)] = result.rows[0].id;
                await photos(client, 'container_id', result.rows[0].id, box.photos);
            }
            const partIds: Record<string, string> = {};
            for (const part of seed.parts || []) {
                const result = await client.query<{ id: string }>(
                    `INSERT INTO parts (key, label, part_number, fits, status, tags, value_low, value_high, notes, container_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz, now())) RETURNING id`,
                    [
                        part.key || null,
                        part.label,
                        part.partNumber || '',
                        part.fits || '',
                        part.status || 'Unverified',
                        part.tags || [],
                        part.valueLow ?? null,
                        part.valueHigh ?? null,
                        part.notes || '',
                        part.container ? (boxIds[part.container] ?? null) : null,
                        ts(part.createdAt),
                    ],
                );
                if (part.key) partIds[part.key] = result.rows[0].id;
                await photos(client, 'part_id', result.rows[0].id, part.photos);
            }
            for (const item of seed.tossed || []) {
                const result = await client.query<{ id: string }>(
                    `INSERT INTO tossed (key, label, part_number, reason, tossed_on, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
                    [
                        item.key || null,
                        item.label,
                        item.partNumber || '',
                        item.reason || '',
                        item.tossedOn || null,
                        item.sortOrder ?? 0,
                    ],
                );
                await photos(client, 'tossed_id', result.rows[0].id, item.photos);
            }
            for (const task of seed.tasks || []) {
                const result = await client.query<{ id: string }>(
                    `INSERT INTO tasks (key, title, phase, notes, steps, done, done_at, created_at)
           VALUES ($1,$2,$3,$4,$7::jsonb,$5,CASE WHEN $5 THEN now() END,COALESCE($6::timestamptz, now())) RETURNING id`,
                    [
                        task.key || null,
                        task.title,
                        task.phase || 3,
                        task.notes || '',
                        task.steps?.length ? task.steps.every((step) => step.done) : Boolean(task.done),
                        ts(task.createdAt),
                        JSON.stringify(task.steps || []),
                    ],
                );
                for (const [index, key] of (task.parts || []).entries()) {
                    if (partIds[key]) {
                        await client.query('INSERT INTO task_parts (task_id, part_id, sort_order) VALUES ($1,$2,$3)', [
                            result.rows[0].id,
                            partIds[key],
                            index,
                        ]);
                    }
                }
            }
            for (const note of seed.notes || []) {
                await client.query(
                    `INSERT INTO notes (key, title, items, created_at) VALUES ($1,$2,$3,COALESCE($4::timestamptz, now()))`,
                    [note.key || null, note.title, note.items || [], ts(note.createdAt)],
                );
            }
            await client.query(`INSERT INTO app_meta (key, value) VALUES ('seeded', now()::text)`);
        });
        const countOf = (kind: 'parts' | 'containers' | 'tossed' | 'tasks' | 'notes') => seed[kind]?.length || 0;
        console.log(
            `Seeded ${countOf('parts')} parts, ${countOf('containers')} containers, ${countOf('tossed')} tossed, ${countOf('tasks')} tasks, ${countOf('notes')} notes.`,
        );
    } catch (err) {
        await removePhotoFiles(written);
        throw err;
    }
}
