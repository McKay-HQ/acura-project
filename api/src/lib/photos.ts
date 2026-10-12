// Server-side photo processing: phone photos are auto-rotated from their EXIF
// orientation, resized, re-encoded as JPEG (which also strips location metadata),
// and a small thumbnail is written for table views.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import type { OutputInfo } from 'sharp';
import { config } from '../config.js';
import { HttpError } from './errors.js';
import type { PhotoFileRow, ProcessedPhoto } from '../types.js';

export async function ensureUploadDir(): Promise<void> {
    await fs.mkdir(config.uploadDir, { recursive: true });
}

export async function processPhoto(buffer: Buffer): Promise<ProcessedPhoto> {
    const base = crypto.randomUUID();
    const filename = `${base}.jpg`;
    const thumbFilename = `${base}_t.jpg`;
    let info: OutputInfo;
    try {
        const img = sharp(buffer, { failOn: 'error' }).rotate();
        info = await img
            .clone()
            .resize({ width: config.photoMaxPx, height: config.photoMaxPx, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 82, mozjpeg: true })
            .toFile(path.join(config.uploadDir, filename));
        await img
            .clone()
            .resize({ width: config.thumbMaxPx, height: config.thumbMaxPx, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 75 })
            .toFile(path.join(config.uploadDir, thumbFilename));
    } catch {
        await removePhotoFiles([{ filename, thumb_filename: thumbFilename }]);
        throw new HttpError(415, 'That file could not be read as a photo. Try a JPEG or PNG.');
    }
    return { filename, thumbFilename, width: info.width, height: info.height };
}

/** Delete photo files from disk; missing files are ignored. */
export async function removePhotoFiles(rows: PhotoFileRow[]): Promise<void> {
    await Promise.all(
        rows
            .flatMap((r) => [r.filename, r.thumb_filename].filter(Boolean))
            .map((f) => fs.unlink(path.join(config.uploadDir, path.basename(f))).catch(() => {})),
    );
}

export const photoUrl = (f: string): string => `/uploads/${f}`;
