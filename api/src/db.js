import pg from 'pg';
import { config } from './config.js';

// Return NUMERIC columns (values) as JS numbers instead of strings.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// Return DATE columns as 'YYYY-MM-DD' strings, not JS Dates shifted by the server's time zone.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool(config.db);
pool.on('error', (err) => console.error('Idle database client error:', err.message));

export const query = (text, params) => pool.query(text, params);

/** Run fn inside a transaction, passing it a dedicated client. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Wait for Postgres to accept connections (a local container or a managed db may still be starting). */
export async function waitForDb({ attempts = 30, delayMs = 2000 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`Waiting for database (${i}/${attempts}): ${err.code || err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
