import express from 'express';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import multer from 'multer';
import { config } from './config.js';
import { query } from './db.js';
import {
    assertRef,
    assertUuid,
    validatePart,
    validateContainer,
    validateTossed,
    validateTask,
    validateNote,
    STATUSES,
    PHASES,
    ICONS,
} from './lib/validate.js';
import { badRequest } from './lib/errors.js';
import { keyMatches, presentedKey, requireKey } from './lib/auth.js';
import * as parts from './services/parts.js';
import * as containers from './services/containers.js';
import * as tossed from './services/tossed.js';
import * as tasks from './services/tasks.js';
import * as notes from './services/notes.js';
import { addRecordPhotos, reorderPhotos, deletePhoto } from './services/common.js';
import { etag, ifMatch, includeDeleted, sendRecord } from './lib/preconditions.js';
import type { IfMatch } from './lib/preconditions.js';
import { getSummary } from './services/summary.js';
import { docs } from './openapi.js';
import type { PhotoTable, ValidateOptions, Versioned } from './types.js';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 12 },
    fileFilter: (_req, file, cb) =>
        file.mimetype.startsWith('image/') ? cb(null, true) : cb(badRequest(`${file.originalname} is not an image`)),
});

/**
 * Files from upload.array(). Multer types req.files as an array or a by-field map (for upload.fields());
 * upload.array() always produces the array, or nothing for a non-multipart request.
 */
const uploadedFiles = (req: Request): Express.Multer.File[] | undefined =>
    Array.isArray(req.files) ? req.files : undefined;

export const api = express.Router();
// The OpenAPI spec and Swagger UI come first so they stay open when an access key is required.
api.use(docs);
api.use(requireKey);

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     description: Runs `SELECT 1` against the database. Always open.
 *     security: []
 *     responses:
 *       200:
 *         description: The API and its database are up.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok]
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   enum: [true]
 *       500:
 *         description: The database could not be reached.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
api.get('/health', async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true });
});

// Tells the web app whether it needs to ask for the access key.
/**
 * @openapi
 * /config:
 *   get:
 *     tags: [System]
 *     summary: App configuration
 *     description: Tells the web app whether it needs to ask for the access key, and the allowed values for pickers. Always open.
 *     security: []
 *     responses:
 *       200:
 *         description: The configuration.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Config'
 * components:
 *   schemas:
 *     Config:
 *       type: object
 *       required: [keyRequiredForChanges, keyRequiredForReads, statuses, phases, icons, maxUploadMb]
 *       properties:
 *         keyRequiredForChanges:
 *           type: boolean
 *           description: True when API_KEY is set.
 *         keyRequiredForReads:
 *           type: boolean
 *           description: True when API_KEY is set and API_KEY_FOR_READS=true.
 *         statuses:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PartStatus'
 *         phases:
 *           type: object
 *           description: Phase number to name.
 *           required: ['1', '2', '3', '4']
 *           properties:
 *             '1':
 *               type: string
 *               example: Before Driving
 *             '2':
 *               type: string
 *               example: Priority
 *             '3':
 *               type: string
 *               example: Non-Priority
 *             '4':
 *               type: string
 *               example: Performance
 *         icons:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ContainerIcon'
 *         maxUploadMb:
 *           type: number
 *           description: Largest photo upload accepted, in MB.
 */
api.get('/config', (_req, res) => {
    res.json({
        keyRequiredForChanges: Boolean(config.apiKey),
        keyRequiredForReads: Boolean(config.apiKey && config.apiKeyForReads),
        statuses: STATUSES,
        phases: PHASES,
        icons: ICONS,
        maxUploadMb: config.maxUploadMb,
    });
});

/**
 * @openapi
 * /auth/check:
 *   post:
 *     tags: [System]
 *     summary: Check an access key
 *     description: >-
 *       Reports whether the key sent in the Authorization (Bearer) or X-API-Key header is right. Always open, and
 *       always 200. `ok` is true when no key is configured.
 *     responses:
 *       200:
 *         description: Whether the presented key is accepted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok]
 *               properties:
 *                 ok:
 *                   type: boolean
 */
api.post('/auth/check', (req, res) => {
    res.json({ ok: !config.apiKey || keyMatches(presentedKey(req)) });
});

/**
 * @openapi
 * /summary:
 *   get:
 *     tags: [System]
 *     summary: Totals for the page header
 *     responses:
 *       200:
 *         description: Part, value, container, tossed and task totals.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Summary'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
api.get('/summary', async (_req, res) => {
    res.json(await getSummary());
});
/**
 * @openapi
 * /tags:
 *   get:
 *     tags: [System]
 *     summary: Tags in use
 *     description: Distinct part tags, plus "Phase N" tags from open tasks, with how many parts have each; most used first.
 *     responses:
 *       200:
 *         description: Tags with counts.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Tag'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
api.get('/tags', async (_req, res) => {
    res.json(await parts.listTags());
});

/** The service functions behind a record type with photos. T is the API shape, I the validated input. */
interface PhotoResource<T extends Versioned, I> {
    noun: string;
    list: (q: Request['query'], includeDeleted: boolean) => Promise<T[]>;
    get: (ref: string, client?: PoolClient) => Promise<T>;
    create: (data: I, files?: Express.Multer.File[]) => Promise<T>;
    update: (ref: string, data: I, im: IfMatch) => Promise<T>;
    /** Soft-deletes; returns the tombstone's version. */
    remove: (ref: string, im: IfMatch) => Promise<number>;
    validate: (body: unknown, opts?: ValidateOptions) => I;
}

/**
 * Standard routes for a record type with photos:
 *   GET /<name> (?includeDeleted=1), GET /<name>/:ref, POST /<name> (JSON, or multipart with "photos" files),
 *   PATCH /<name>/:ref, DELETE /<name>/:ref,
 *   POST /<name>/:ref/photos (multipart "photos"), PUT /<name>/:ref/photos/order { ids: [...] }
 * :ref is a UUID or the record's key. Writes to an existing record need If-Match with its version;
 * single-record responses carry ETag: "<version>".
 */
function photoResource<T extends Versioned, I>(
    name: PhotoTable,
    { list, get, create, update, remove, validate, noun }: PhotoResource<T, I>,
): void {
    api.get(`/${name}`, async (req, res) => {
        res.json(await list(req.query, includeDeleted(req)));
    });
    api.get(`/${name}/:ref`, async (req, res) => {
        sendRecord(res, 200, await get(assertRef(req.params.ref, noun)));
    });
    api.post(`/${name}`, upload.array('photos'), async (req, res) => {
        sendRecord(res, 201, await create(validate(req.body || {}, { create: true }), uploadedFiles(req)));
    });
    api.patch(`/${name}/:ref`, async (req, res) => {
        const im = ifMatch(req);
        sendRecord(res, 200, await update(assertRef(req.params.ref, noun), validate(req.body || {}), im));
    });
    api.delete(`/${name}/:ref`, async (req, res) => {
        const im = ifMatch(req);
        const version = await remove(assertRef(req.params.ref, noun), im);
        res.status(204).set('ETag', etag(version)).end();
    });
    api.post(`/${name}/:ref/photos`, upload.array('photos'), async (req, res) => {
        const im = ifMatch(req);
        sendRecord(res, 201, await addRecordPhotos(name, assertRef(req.params.ref, noun), uploadedFiles(req), im, get));
    });
    api.put(`/${name}/:ref/photos/order`, async (req, res) => {
        const im = ifMatch(req);
        sendRecord(res, 200, await reorderPhotos(name, assertRef(req.params.ref, noun), req.body?.ids, im, get));
    });
}

/**
 * @openapi
 * /parts:
 *   get:
 *     tags: [Parts]
 *     summary: List parts
 *     description: Filters are optional and combined with AND. Oldest first.
 *     parameters:
 *       - $ref: '#/components/parameters/includeDeleted'
 *       - name: status
 *         in: query
 *         description: Only parts with any of these statuses (repeat the parameter or separate with commas).
 *         style: form
 *         explode: true
 *         schema:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PartStatus'
 *       - name: tag
 *         in: query
 *         description: >-
 *           Only parts with any of these tags (repeat or separate with commas). Special values: `Phase 1`..`Phase 4`
 *           match parts used by an open task in that phase; `Other cars` matches parts whose `fits` is set and is not `RSX`.
 *         style: form
 *         explode: true
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - name: fits
 *         in: query
 *         description: Only parts whose `fits` is exactly one of these values (repeat or separate with commas).
 *         style: form
 *         explode: true
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *       - name: container
 *         in: query
 *         description: >-
 *           A container UUID or key: parts in that container or its sub-containers (404 if there is no such container).
 *           `none` = parts not in any container.
 *         schema:
 *           type: string
 *       - name: q
 *         in: query
 *         description: Case-insensitive text search in name, part number, notes and tags.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The parts.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Part'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   post:
 *     tags: [Parts]
 *     summary: Create a part
 *     description: >-
 *       Send JSON, or multipart/form-data with the same fields as text plus image files in `photos`. Only `label` is required. A part with photos is created only if every photo can be processed.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/PartInput'
 *               - required: [label]
 *           example: { label: Injen cold air intake, key: injen-intake, status: Verified, tags: [Intake, For sale], valueLow: 150, valueHigh: 220, containerId: box-engine }
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/PartInput'
 *               - type: object
 *                 required: [label]
 *                 properties:
 *                   photos:
 *                     type: array
 *                     maxItems: 12
 *                     items:
 *                       type: string
 *                       format: binary
 *     responses:
 *       201:
 *         description: The created part.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Part'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       415:
 *         $ref: '#/components/responses/UnsupportedPhoto'
 * /parts/{ref}:
 *   parameters:
 *     - $ref: '#/components/parameters/partRef'
 *   get:
 *     tags: [Parts]
 *     summary: Get a part
 *     responses:
 *       200:
 *         description: The part.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Part'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     tags: [Parts]
 *     summary: Update a part
 *     description: Changes only the fields sent. An empty body changes nothing and returns the part.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PartInput'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       200:
 *         description: The updated part.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Part'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 *   delete:
 *     tags: [Parts]
 *     summary: Delete a part
 *     description: >-
 *       Soft-deletes the part: it becomes a tombstone (`deletedAt` set, version bumped) that only lists with
 *       `includeDeleted=1` show, and its key stays taken. Its photos are deleted and it is removed from tasks (their
 *       versions are bumped). To keep it on the Tossed list instead, use POST /parts/{ref}/toss.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       204:
 *         description: Deleted; the ETag is the tombstone's version.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 * /parts/{ref}/photos:
 *   parameters:
 *     - $ref: '#/components/parameters/partRef'
 *   post:
 *     tags: [Parts, Photos]
 *     summary: Add photos to a part
 *     description: The new photos go after any existing ones.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PhotoUpload'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       201:
 *         description: The part with its photos.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Part'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       415:
 *         $ref: '#/components/responses/UnsupportedPhoto'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 * /parts/{ref}/photos/order:
 *   parameters:
 *     - $ref: '#/components/parameters/partRef'
 *   put:
 *     tags: [Parts, Photos]
 *     summary: Reorder a part's photos
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PhotoOrder'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       200:
 *         description: The part with its photos in the new order.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Part'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 */
photoResource('parts', {
    noun: 'part id',
    list: (q, all) => parts.listParts(q, all),
    get: parts.getPart,
    create: parts.createPart,
    update: parts.updatePart,
    remove: parts.deletePart,
    validate: validatePart,
});

// Move a part to the Tossed list (keeps its photos). Body: { reason?, tossedOn? }
/**
 * @openapi
 * /parts/{ref}/toss:
 *   parameters:
 *     - $ref: '#/components/parameters/partRef'
 *   post:
 *     tags: [Parts, Tossed]
 *     summary: Toss a part
 *     description: >-
 *       Moves the part to the Tossed list: creates a tossed record with its name, part number, key (if another
 *       tossed record already has that key, with -2, -3... added) and photos, then soft-deletes the part and removes
 *       it from its tasks. The body is optional. The ETag is the new tossed record's version.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PartTossInput'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       201:
 *         description: The new tossed record.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tossed'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 */
api.post('/parts/:ref/toss', async (req, res) => {
    const im = ifMatch(req);
    const v = validateTossed({ reason: req.body?.reason ?? '', tossedOn: req.body?.tossedOn ?? null });
    const id = await parts.tossPart(assertRef(req.params.ref, 'part id'), v, im);
    sendRecord(res, 201, await tossed.getTossed(id));
});

/**
 * @openapi
 * /containers:
 *   get:
 *     tags: [Containers]
 *     summary: List containers
 *     description: All containers, top-level and sub-containers, in display order (sortOrder, then oldest first).
 *     parameters:
 *       - $ref: '#/components/parameters/includeDeleted'
 *     responses:
 *       200:
 *         description: The containers.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Container'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   post:
 *     tags: [Containers]
 *     summary: Create a container
 *     description: >-
 *       Send JSON, or multipart/form-data with the same fields as text plus image files in `photos`. Only `name` is required.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/ContainerInput'
 *               - required: [name]
 *           example: { name: Small Trim, key: small-trim, parentId: body-trim, icon: trim }
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/ContainerInput'
 *               - type: object
 *                 required: [name]
 *                 properties:
 *                   photos:
 *                     type: array
 *                     maxItems: 12
 *                     items:
 *                       type: string
 *                       format: binary
 *     responses:
 *       201:
 *         description: The created container.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Container'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       415:
 *         $ref: '#/components/responses/UnsupportedPhoto'
 * /containers/{ref}:
 *   parameters:
 *     - $ref: '#/components/parameters/containerRef'
 *   get:
 *     tags: [Containers]
 *     summary: Get a container
 *     responses:
 *       200:
 *         description: The container.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Container'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     tags: [Containers]
 *     summary: Update a container
 *     description: Changes only the fields sent. An empty body changes nothing and returns the container.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContainerInput'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       200:
 *         description: The updated container.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Container'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 *   delete:
 *     tags: [Containers]
 *     summary: Delete a container
 *     description: >-
 *       Soft-deletes the container (a tombstone, as for parts) and deletes its photos. Parts in a sub-container move
 *       up to its parent; parts in a top-level container are left without a container, and its sub-containers become
 *       top-level (each part or container that moves gets a new version).
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       204:
 *         description: Deleted; the ETag is the tombstone's version.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 * /containers/{ref}/photos:
 *   parameters:
 *     - $ref: '#/components/parameters/containerRef'
 *   post:
 *     tags: [Containers, Photos]
 *     summary: Add photos to a container
 *     description: The new photos go after any existing ones.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PhotoUpload'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       201:
 *         description: The container with its photos.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Container'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       415:
 *         $ref: '#/components/responses/UnsupportedPhoto'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 * /containers/{ref}/photos/order:
 *   parameters:
 *     - $ref: '#/components/parameters/containerRef'
 *   put:
 *     tags: [Containers, Photos]
 *     summary: Reorder a container's photos
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PhotoOrder'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       200:
 *         description: The container with its photos in the new order.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Container'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 */
photoResource('containers', {
    noun: 'container id',
    list: (_q, all) => containers.listContainers(all),
    get: containers.getContainer,
    create: containers.createContainer,
    update: containers.updateContainer,
    remove: containers.deleteContainer,
    validate: validateContainer,
});

/**
 * @openapi
 * /tossed:
 *   get:
 *     tags: [Tossed]
 *     summary: List tossed records
 *     description: Tossed parts in display order.
 *     parameters:
 *       - $ref: '#/components/parameters/includeDeleted'
 *     responses:
 *       200:
 *         description: The tossed records.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Tossed'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   post:
 *     tags: [Tossed]
 *     summary: Create a tossed record
 *     description: >-
 *       Send JSON, or multipart/form-data with the same fields as text plus image files in `photos`. Only `label` is required; tossedOn defaults to today. New records go to the end of the list.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/TossedInput'
 *               - required: [label]
 *           example: { label: Cracked headlight, reason: Mount tabs broken, tossedOn: 2026-10-06 }
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/TossedInput'
 *               - type: object
 *                 required: [label]
 *                 properties:
 *                   photos:
 *                     type: array
 *                     maxItems: 12
 *                     items:
 *                       type: string
 *                       format: binary
 *     responses:
 *       201:
 *         description: The created tossed record.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tossed'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       415:
 *         $ref: '#/components/responses/UnsupportedPhoto'
 * /tossed/{ref}:
 *   parameters:
 *     - $ref: '#/components/parameters/tossedRef'
 *   get:
 *     tags: [Tossed]
 *     summary: Get a tossed record
 *     responses:
 *       200:
 *         description: The tossed record.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tossed'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     tags: [Tossed]
 *     summary: Update a tossed record
 *     description: Changes only the fields sent. An empty body changes nothing and returns the tossed record.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TossedInput'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       200:
 *         description: The updated tossed record.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tossed'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 *   delete:
 *     tags: [Tossed]
 *     summary: Delete a tossed record
 *     description: Soft-deletes the record (a tombstone, as for parts) and deletes its photos.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       204:
 *         description: Deleted; the ETag is the tombstone's version.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 * /tossed/{ref}/photos:
 *   parameters:
 *     - $ref: '#/components/parameters/tossedRef'
 *   post:
 *     tags: [Tossed, Photos]
 *     summary: Add photos to a tossed record
 *     description: The new photos go after any existing ones.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PhotoUpload'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       201:
 *         description: The tossed record with its photos.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tossed'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       415:
 *         $ref: '#/components/responses/UnsupportedPhoto'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 * /tossed/{ref}/photos/order:
 *   parameters:
 *     - $ref: '#/components/parameters/tossedRef'
 *   put:
 *     tags: [Tossed, Photos]
 *     summary: Reorder a tossed record's photos
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PhotoOrder'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       200:
 *         description: The tossed record with its photos in the new order.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tossed'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 */
photoResource('tossed', {
    noun: 'tossed id',
    list: (_q, all) => tossed.listTossed(all),
    get: tossed.getTossed,
    create: tossed.createTossed,
    update: tossed.updateTossed,
    remove: tossed.deleteTossed,
    validate: validateTossed,
});

// Delete a single photo; responds with the updated record it belonged to.
/**
 * @openapi
 * /photos/{id}:
 *   parameters:
 *     - $ref: '#/components/parameters/photoId'
 *   delete:
 *     tags: [Photos]
 *     summary: Delete a photo
 *     description: >-
 *       Deletes one photo of a part, container or tossed record (and its files), and responds with the updated record
 *       it belonged to - a Part, Container or Tossed object depending on the owner.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       200:
 *         description: The record the photo belonged to.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/Part'
 *                 - $ref: '#/components/schemas/Container'
 *                 - $ref: '#/components/schemas/Tossed'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 */
api.delete('/photos/:id', async (req, res) => {
    const im = ifMatch(req);
    const getters = { parts: parts.getPart, containers: containers.getContainer, tossed: tossed.getTossed };
    sendRecord(res, 200, await deletePhoto(assertUuid(req.params.id, 'photo id'), im, getters));
});

// ---- tasks ----
/**
 * @openapi
 * /tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks
 *     description: By phase; within a phase open tasks first, then oldest first.
 *     parameters:
 *       - $ref: '#/components/parameters/includeDeleted'
 *     responses:
 *       200:
 *         description: The tasks.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
api.get('/tasks', async (req, res) => {
    res.json(await tasks.listTasks(includeDeleted(req)));
});
/**
 * @openapi
 * /tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task
 *     description: Only `title` is required. Unknown part ids or keys in `partIds` are a 400.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/TaskInput'
 *               - required: [title]
 *           example: { title: Replace clutch master cylinder, phase: 1, partIds: [injen-intake] }
 *     responses:
 *       201:
 *         description: The created task.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
api.post('/tasks', async (req, res) => {
    sendRecord(res, 201, await tasks.createTask(validateTask(req.body || {}, { create: true })));
});
/**
 * @openapi
 * /tasks/{ref}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get a task
 *     description: By UUID or key.
 *     parameters:
 *       - $ref: '#/components/parameters/taskRef'
 *     responses:
 *       200:
 *         description: The task.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
api.get('/tasks/:ref', async (req, res) => {
    sendRecord(res, 200, await tasks.getTask(assertRef(req.params.ref, 'task id')));
});
/**
 * @openapi
 * /tasks/{ref}:
 *   patch:
 *     tags: [Tasks]
 *     summary: Update a task
 *     description: Changes only the fields sent; `partIds`, when sent, replaces the task's parts.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *       - $ref: '#/components/parameters/taskRef'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskInput'
 *           example: { done: true }
 *     responses:
 *       200:
 *         description: The updated task.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 */
api.patch('/tasks/:ref', async (req, res) => {
    const im = ifMatch(req);
    sendRecord(
        res,
        200,
        await tasks.updateTask(assertRef(req.params.ref, 'task id'), validateTask(req.body || {}), im),
    );
});
/**
 * @openapi
 * /tasks/{ref}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task
 *     description: Soft-deletes the task (a tombstone, as for parts). The parts it used are not affected.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *       - $ref: '#/components/parameters/taskRef'
 *     responses:
 *       204:
 *         description: Deleted; the ETag is the tombstone's version.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 */
api.delete('/tasks/:ref', async (req, res) => {
    const im = ifMatch(req);
    const version = await tasks.deleteTask(assertRef(req.params.ref, 'task id'), im);
    res.status(204).set('ETag', etag(version)).end();
});

// ---- notes ----
/**
 * @openapi
 * /notes:
 *   get:
 *     tags: [Notes]
 *     summary: List notes
 *     description: Oldest first.
 *     parameters:
 *       - $ref: '#/components/parameters/includeDeleted'
 *     responses:
 *       200:
 *         description: The notes.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Note'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
api.get('/notes', async (req, res) => {
    res.json(await notes.listNotes(includeDeleted(req)));
});
/**
 * @openapi
 * /notes/{ref}:
 *   get:
 *     tags: [Notes]
 *     summary: Get a note
 *     parameters:
 *       - $ref: '#/components/parameters/noteRef'
 *     responses:
 *       200:
 *         description: The note.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Note'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
api.get('/notes/:ref', async (req, res) => {
    sendRecord(res, 200, await notes.getNote(assertRef(req.params.ref, 'note id')));
});
/**
 * @openapi
 * /notes:
 *   post:
 *     tags: [Notes]
 *     summary: Create a note
 *     description: Only `title` is required.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/NoteInput'
 *               - required: [title]
 *           example: { title: Interior observations, items: [Driver seat bolster worn, Headliner sagging] }
 *     responses:
 *       201:
 *         description: The created note.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Note'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
api.post('/notes', async (req, res) => {
    sendRecord(res, 201, await notes.createNote(validateNote(req.body || {}, { create: true })));
});
/**
 * @openapi
 * /notes/{ref}:
 *   patch:
 *     tags: [Notes]
 *     summary: Update a note
 *     description: Changes only the fields sent; `items`, when sent, replaces the list.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *       - $ref: '#/components/parameters/noteRef'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NoteInput'
 *     responses:
 *       200:
 *         description: The updated note.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Note'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 */
api.patch('/notes/:ref', async (req, res) => {
    const im = ifMatch(req);
    sendRecord(
        res,
        200,
        await notes.updateNote(assertRef(req.params.ref, 'note id'), validateNote(req.body || {}), im),
    );
});
/**
 * @openapi
 * /notes/{ref}:
 *   delete:
 *     tags: [Notes]
 *     summary: Delete a note
 *     description: Soft-deletes the note (a tombstone, as for parts).
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *       - $ref: '#/components/parameters/noteRef'
 *     responses:
 *       204:
 *         description: Deleted; the ETag is the tombstone's version.
 *         headers:
 *           ETag:
 *             $ref: '#/components/headers/ETag'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       412:
 *         $ref: '#/components/responses/PreconditionFailed'
 *       428:
 *         $ref: '#/components/responses/PreconditionRequired'
 */
api.delete('/notes/:ref', async (req, res) => {
    const im = ifMatch(req);
    const version = await notes.deleteNote(assertRef(req.params.ref, 'note id'), im);
    res.status(204).set('ETag', etag(version)).end();
});
