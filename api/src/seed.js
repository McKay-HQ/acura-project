// One-time import of seed/seed.json (the inventory carried over from the artifact page).
// Runs only against an empty database, and only once: app_meta records it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from './db.js';
import { processPhoto, removePhotoFiles } from './lib/photos.js';

const seedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed');

export async function seedIfEmpty() {
  const already = await pool.query(`SELECT 1 FROM app_meta WHERE key = 'seeded'`);
  if (already.rowCount) return;
  const { rows } = await pool.query(`SELECT
    (SELECT count(*) FROM parts) + (SELECT count(*) FROM containers) + (SELECT count(*) FROM tossed)
    + (SELECT count(*) FROM tasks) + (SELECT count(*) FROM notes) AS n`);
  if (Number(rows[0].n) > 0) {
    await pool.query(`INSERT INTO app_meta (key, value) VALUES ('seeded', 'skipped: data present')`);
    return;
  }

  let seed;
  try {
    seed = JSON.parse(await fs.readFile(path.join(seedDir, 'seed.json'), 'utf8'));
  } catch {
    console.log('No seed file found; starting empty.');
    return;
  }

  const written = [];
  async function photos(c, col, id, names = []) {
    let order = 0;
    for (const name of names) {
      const buf = await fs.readFile(path.join(seedDir, 'photos', path.basename(name)));
      const p = await processPhoto(buf);
      written.push({ filename: p.filename, thumb_filename: p.thumbFilename });
      await c.query(
        `INSERT INTO photos (${col}, filename, thumb_filename, width, height, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, p.filename, p.thumbFilename, p.width, p.height, order++],
      );
    }
  }
  const ts = (v) => v || null;

  console.log('Importing starter inventory (this processes every photo; give it a minute)…');
  try {
    await tx(async (c) => {
      const boxIds = {};
      // Top-level containers first, so sub-containers can point at their parent.
      const boxes = [...(seed.containers || [])].sort((a, b) => Number(Boolean(a.parent)) - Number(Boolean(b.parent)));
      for (const b of boxes) {
        const r = await c.query(
          `INSERT INTO containers (key, name, location, notes, parent_id, icon, sort_order, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz, now())) RETURNING id`,
          [b.key || null, b.name, b.location || '', b.notes || '', b.parent ? boxIds[b.parent] ?? null : null,
            b.icon || 'box', b.order ?? 0, ts(b.createdAt)],
        );
        boxIds[b.key] = r.rows[0].id;
        await photos(c, 'container_id', r.rows[0].id, b.photos);
      }
      const partIds = {};
      for (const p of seed.parts || []) {
        const r = await c.query(
          `INSERT INTO parts (key, label, part_number, fits, status, tags, value_low, value_high, notes, container_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz, now())) RETURNING id`,
          [p.key || null, p.label, p.partNumber || '', p.fits || '', p.status || 'Unverified', p.tags || [],
            p.valueLow ?? null, p.valueHigh ?? null, p.notes || '', p.container ? boxIds[p.container] ?? null : null,
            ts(p.createdAt)],
        );
        if (p.key) partIds[p.key] = r.rows[0].id;
        await photos(c, 'part_id', r.rows[0].id, p.photos);
      }
      for (const t of seed.tossed || []) {
        const r = await c.query(
          `INSERT INTO tossed (key, label, part_number, reason, tossed_on, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [t.key || null, t.label, t.partNumber || '', t.reason || '', t.tossedOn || null, t.sortOrder ?? 0],
        );
        await photos(c, 'tossed_id', r.rows[0].id, t.photos);
      }
      for (const t of seed.tasks || []) {
        const r = await c.query(
          `INSERT INTO tasks (title, phase, notes, done, done_at, created_at)
           VALUES ($1,$2,$3,$4,CASE WHEN $4 THEN now() END,COALESCE($5::timestamptz, now())) RETURNING id`,
          [t.title, t.phase || 3, t.notes || '', Boolean(t.done), ts(t.createdAt)],
        );
        for (const [i, key] of (t.parts || []).entries()) {
          if (partIds[key]) {
            await c.query('INSERT INTO task_parts (task_id, part_id, sort_order) VALUES ($1,$2,$3)', [r.rows[0].id, partIds[key], i]);
          }
        }
      }
      for (const n of seed.notes || []) {
        await c.query(
          `INSERT INTO notes (key, title, items, created_at) VALUES ($1,$2,$3,COALESCE($4::timestamptz, now()))`,
          [n.key || null, n.title, n.items || [], ts(n.createdAt)],
        );
      }
      await c.query(`INSERT INTO app_meta (key, value) VALUES ('seeded', now()::text)`);
    });
    const n = (k) => seed[k]?.length || 0;
    console.log(`Seeded ${n('parts')} parts, ${n('containers')} containers, ${n('tossed')} tossed, ${n('tasks')} tasks, ${n('notes')} notes.`);
  } catch (err) {
    await removePhotoFiles(written);
    throw err;
  }
}
