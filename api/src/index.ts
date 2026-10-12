import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config, describeDb } from './config.js';
import { pool, waitForDb } from './db.js';
import { migrate } from './migrate.js';
import { seedIfEmpty } from './seed.js';
import { ensureUploadDir } from './lib/photos.js';
import { api } from './routes.js';

/**
 * What the error handler reads from an error: our HttpError (status, details), body-parser
 * errors (status, type), or anything else thrown (treated as a 500).
 */
interface ErrorLike {
    status?: number;
    type?: string;
    message?: string;
    details?: unknown;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use('/api', api);

// Photo files have unique names, so browsers may cache them indefinitely.
app.use('/uploads', express.static(config.uploadDir, { immutable: true, maxAge: '365d', index: false }));

app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err: ErrorLike, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? `Photos must be under ${config.maxUploadMb} MB` : err.message;
        res.status(400).json({ error: msg });
        return;
    }
    if (err.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'Request body is not valid JSON' });
        return;
    }
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
        error: status >= 500 ? 'Something went wrong on the server' : err.message,
        details: err.details,
    });
});

async function start(): Promise<void> {
    await ensureUploadDir();
    console.log(`Database: ${describeDb()}${config.apiKey ? ' · API key required for changes' : ''}`);
    await waitForDb();
    await migrate();
    if (config.seedOnEmpty) await seedIfEmpty();
    const server = app.listen(config.port, () => console.log(`API listening on :${config.port}`));
    const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
}

start().catch((err: unknown) => {
    console.error('Failed to start:', err);
    process.exit(1);
});
