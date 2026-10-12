// Minimal migration runner: applies migrations/*.sql in filename order, once each.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

// Resolves to api/migrations from both src/ (tsx) and dist/ (compiled).
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

export async function migrate(): Promise<void> {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set(
        (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
        if (done.has(file)) continue;
        const sql = await fs.readFile(path.join(dir, file), 'utf8');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
            await client.query('COMMIT');
            console.log(`Applied migration ${file}`);
        } catch (err) {
            await client.query('ROLLBACK');
            // pg always rejects with an Error; the cast keeps the message lookup unchanged.
            throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
        } finally {
            client.release();
        }
    }
}
