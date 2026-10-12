// Optional API key. With API_KEY unset the app is open (fine on a home network).
// With API_KEY set, changes need the key in an "Authorization: Bearer <key>" or
// "X-API-Key: <key>" header; set API_KEY_FOR_READS=true to protect reads as well.
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { HttpError } from './errors.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Always reachable, so the app can load and ask for the key.
const PUBLIC_PATHS = new Set(['/health', '/config', '/auth/check']);

export function presentedKey(req: Request): string {
    const h = req.get('authorization') || '';
    if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
    return (req.get('x-api-key') || '').trim();
}

export function keyMatches(given: string): boolean {
    if (!config.apiKey || !given) return false;
    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(config.apiKey).digest();
    return crypto.timingSafeEqual(a, b);
}

export function requireKey(req: Request, _res: Response, next: NextFunction): void {
    if (!config.apiKey || PUBLIC_PATHS.has(req.path)) return next();
    const isRead = READ_METHODS.has(req.method);
    if (isRead && !config.apiKeyForReads) return next();
    if (keyMatches(presentedKey(req))) return next();
    next(new HttpError(401, isRead ? 'This app needs the access key.' : 'Enter the access key to make changes.'));
}
