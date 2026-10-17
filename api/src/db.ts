import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './config.js';

// Return NUMERIC columns (values) as JS numbers instead of strings.
pg.types.setTypeParser(1700, (value: string | null) => (value === null ? null : parseFloat(value)));
// Return DATE columns as 'YYYY-MM-DD' strings, not JS Dates shifted by the server's time zone.
pg.types.setTypeParser(1082, (value: string) => value);

export const pool = new pg.Pool(config.db);
pool.on('error', (err) => console.error('Idle database client error:', err.message));

export function query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
): Promise<QueryResult<R>> {
    return pool.query<R>(text, params);
}

/** Query on a transaction client when one is given, else on the pool. */
export function runner(client?: PoolClient): typeof query {
    if (!client) return query;
    return <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
        client.query<R>(text, params);
}

/** Run fn inside a transaction, passing it a dedicated client. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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
export async function waitForDb({ attempts = 30, delayMs = 2000 } = {}): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await pool.query('SELECT 1');
            return;
        } catch (err) {
            if (attempt === attempts) throw err;
            // pg connection failures are Node system errors (ECONNREFUSED, ...) or pg DatabaseErrors;
            // both carry `code` and `message`.
            const error = err as NodeJS.ErrnoException;
            console.log(`Waiting for database (${attempt}/${attempts}): ${error.code || error.message}`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
}
