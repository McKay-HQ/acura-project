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
import { etag, ifMatch, sendRecord } from './lib/preconditions.js';
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
 *     description: >-
 *       Tells the web app whether it needs to ask for the access key, and the allowed values for pickers. Always open.
 *     security: []
 *     responses:
 *       200:
 *         description: The configuration.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Config'
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
 *       401: { $ref: '#/components/responses/Unauthorized' }
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
 *     description: >-
 *       Distinct part tags, plus "Phase N" tags from open tasks, with how many parts have each; most used first.
 *     responses:
 *       200:
 *         description: Tags with counts.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Tag'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
api.get('/tags', async (_req, res) => {
    res.json(await parts.listTags());
});

/** The service functions behind a record type with photos. T is the API shape, I the validated input. */
interface PhotoResource<T extends Versioned, I> {
    noun: string;
    list: (q: Request['query']) => Promise<T[]>;
    get: (ref: string, client?: PoolClient) => Promise<T>;
    create: (data: I, files?: Express.Multer.File[]) => Promise<T>;
    update: (ref: string, data: I, im: IfMatch) => Promise<T>;
    /** Soft-deletes; returns the tombstone's version. */
    remove: (ref: string, im: IfMatch) => Promise<number>;
    validate: (body: unknown, opts?: ValidateOptions) => I;
}

/**
 * Standard routes for a record type with photos:
 *   GET /<name>, GET /<name>/:ref, POST /<name> (JSON, or multipart with "photos" files),
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
        res.json(await list(req.query));
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
 *       - $ref: '#/components/parameters/partStatusFilter'
 *       - $ref: '#/components/parameters/partTagFilter'
 *       - $ref: '#/components/parameters/partFitsFilter'
 *       - $ref: '#/components/parameters/partContainerFilter'
 *       - $ref: '#/components/parameters/partSearch'
 *     responses:
 *       200: { $ref: '#/components/responses/PartList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   post:
 *     tags: [Parts]
 *     summary: Create a part
 *     description: >-
 *       Send JSON, or multipart/form-data with the same fields as text plus image files in `photos`. Only `label` is
 *       required. A part with photos is created only if every photo can be processed.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PartCreate'
 *     responses:
 *       201: { $ref: '#/components/responses/PartCreated' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       415: { $ref: '#/components/responses/UnsupportedPhoto' }
 * /parts/{ref}:
 *   parameters:
 *     - $ref: '#/components/parameters/partRef'
 *   get:
 *     tags: [Parts]
 *     summary: Get a part
 *     responses:
 *       200: { $ref: '#/components/responses/Part' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Parts]
 *     summary: Update a part
 *     description: Changes only the fields sent. An empty body changes nothing and returns the part.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PartUpdate'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       200: { $ref: '#/components/responses/PartUpdated' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
 *   delete:
 *     tags: [Parts]
 *     summary: Delete a part
 *     description: >-
 *       Soft-deletes the part: it becomes a tombstone (`deletedAt` set, version bumped) that no read returns,
 *       and its key stays taken. Its photos are deleted and it is removed from tasks (their versions are bumped).
 *       To keep it on the Tossed list instead, use POST /parts/{ref}/toss.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       204: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *       201: { $ref: '#/components/responses/PartPhotosAdded' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       415: { $ref: '#/components/responses/UnsupportedPhoto' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *       200: { $ref: '#/components/responses/PartPhotosReordered' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
 */
photoResource('parts', {
    noun: 'part id',
    list: (filters) => parts.listParts(filters),
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
 *       $ref: '#/components/requestBodies/PartToss'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       201: { $ref: '#/components/responses/TossedFromPart' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
 */
api.post('/parts/:ref/toss', async (req, res) => {
    const im = ifMatch(req);
    const input = validateTossed({ reason: req.body?.reason ?? '', tossedOn: req.body?.tossedOn ?? null });
    const id = await parts.tossPart(assertRef(req.params.ref, 'part id'), input, im);
    sendRecord(res, 201, await tossed.getTossed(id));
});

/**
 * @openapi
 * /containers:
 *   get:
 *     tags: [Containers]
 *     summary: List containers
 *     description: All containers, top-level and sub-containers, in display order (sortOrder, then oldest first).
 *     responses:
 *       200: { $ref: '#/components/responses/ContainerList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   post:
 *     tags: [Containers]
 *     summary: Create a container
 *     description: >-
 *       Send JSON, or multipart/form-data with the same fields as text plus image files in `photos`. Only `name` is
 *       required.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/ContainerCreate'
 *     responses:
 *       201: { $ref: '#/components/responses/ContainerCreated' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       415: { $ref: '#/components/responses/UnsupportedPhoto' }
 * /containers/{ref}:
 *   parameters:
 *     - $ref: '#/components/parameters/containerRef'
 *   get:
 *     tags: [Containers]
 *     summary: Get a container
 *     responses:
 *       200: { $ref: '#/components/responses/Container' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Containers]
 *     summary: Update a container
 *     description: Changes only the fields sent. An empty body changes nothing and returns the container.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/ContainerUpdate'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       200: { $ref: '#/components/responses/ContainerUpdated' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *       204: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *       201: { $ref: '#/components/responses/ContainerPhotosAdded' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       415: { $ref: '#/components/responses/UnsupportedPhoto' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *       200: { $ref: '#/components/responses/ContainerPhotosReordered' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
 */
photoResource('containers', {
    noun: 'container id',
    list: () => containers.listContainers(),
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
 *     responses:
 *       200: { $ref: '#/components/responses/TossedList' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   post:
 *     tags: [Tossed]
 *     summary: Create a tossed record
 *     description: >-
 *       Send JSON, or multipart/form-data with the same fields as text plus image files in `photos`. Only `label` is
 *       required; tossedOn defaults to today. New records go to the end of the list.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/TossedCreate'
 *     responses:
 *       201: { $ref: '#/components/responses/TossedCreated' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       415: { $ref: '#/components/responses/UnsupportedPhoto' }
 * /tossed/{ref}:
 *   parameters:
 *     - $ref: '#/components/parameters/tossedRef'
 *   get:
 *     tags: [Tossed]
 *     summary: Get a tossed record
 *     responses:
 *       200: { $ref: '#/components/responses/Tossed' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Tossed]
 *     summary: Update a tossed record
 *     description: Changes only the fields sent. An empty body changes nothing and returns the tossed record.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/TossedUpdate'
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       200: { $ref: '#/components/responses/TossedUpdated' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
 *   delete:
 *     tags: [Tossed]
 *     summary: Delete a tossed record
 *     description: Soft-deletes the record (a tombstone, as for parts) and deletes its photos.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/ifMatch'
 *     responses:
 *       204: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *       201: { $ref: '#/components/responses/TossedPhotosAdded' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       415: { $ref: '#/components/responses/UnsupportedPhoto' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *       200: { $ref: '#/components/responses/TossedPhotosReordered' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
 */
photoResource('tossed', {
    noun: 'tossed id',
    list: () => tossed.listTossed(),
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
 *       200: { $ref: '#/components/responses/PhotoDeleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *     responses:
 *       200: { $ref: '#/components/responses/TaskList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
api.get('/tasks', async (req, res) => {
    res.json(await tasks.listTasks());
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
 *       $ref: '#/components/requestBodies/TaskCreate'
 *     responses:
 *       201: { $ref: '#/components/responses/TaskCreated' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
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
 *       200: { $ref: '#/components/responses/Task' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
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
 *       $ref: '#/components/requestBodies/TaskUpdate'
 *     responses:
 *       200: { $ref: '#/components/responses/TaskUpdated' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *       204: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *     responses:
 *       200: { $ref: '#/components/responses/NoteList' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
api.get('/notes', async (req, res) => {
    res.json(await notes.listNotes());
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
 *       200: { $ref: '#/components/responses/Note' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
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
 *       $ref: '#/components/requestBodies/NoteCreate'
 *     responses:
 *       201: { $ref: '#/components/responses/NoteCreated' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { $ref: '#/components/responses/Conflict' }
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
 *       $ref: '#/components/requestBodies/NoteUpdate'
 *     responses:
 *       200: { $ref: '#/components/responses/NoteUpdated' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
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
 *       204: { $ref: '#/components/responses/Deleted' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       412: { $ref: '#/components/responses/PreconditionFailed' }
 *       428: { $ref: '#/components/responses/PreconditionRequired' }
 */
api.delete('/notes/:ref', async (req, res) => {
    const im = ifMatch(req);
    const version = await notes.deleteNote(assertRef(req.params.ref, 'note id'), im);
    res.status(204).set('ETag', etag(version)).end();
});
