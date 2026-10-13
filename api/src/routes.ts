import express from 'express';
import type { Request } from 'express';
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
import { resolveId, addPhotos, reorderPhotos, deletePhoto } from './services/common.js';
import { getSummary } from './services/summary.js';
import { docs } from './openapi.js';
import type { PhotoTable, ValidateOptions } from './types.js';

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
interface PhotoResource<T, I> {
    noun: string;
    list: (q: Request['query']) => Promise<T[]>;
    get: (ref: string) => Promise<T>;
    create: (data: I, files?: Express.Multer.File[]) => Promise<T>;
    update: (ref: string, data: I) => Promise<T>;
    remove: (ref: string) => Promise<void>;
    validate: (body: unknown, opts?: ValidateOptions) => I;
}

/**
 * Standard routes for a record type with photos:
 *   GET /<name>, GET /<name>/:ref, POST /<name> (JSON, or multipart with "photos" files),
 *   PATCH /<name>/:ref, DELETE /<name>/:ref,
 *   POST /<name>/:ref/photos (multipart "photos"), PUT /<name>/:ref/photos/order { ids: [...] }
 * :ref is a UUID or the record's key.
 */
function photoResource<T, I>(
    name: PhotoTable,
    { list, get, create, update, remove, validate, noun }: PhotoResource<T, I>,
): void {
    api.get(`/${name}`, async (req, res) => {
        res.json(await list(req.query));
    });
    api.get(`/${name}/:ref`, async (req, res) => {
        res.json(await get(assertRef(req.params.ref, noun)));
    });
    api.post(`/${name}`, upload.array('photos'), async (req, res) => {
        res.status(201).json(await create(validate(req.body || {}, { create: true }), uploadedFiles(req)));
    });
    api.patch(`/${name}/:ref`, async (req, res) => {
        res.json(await update(assertRef(req.params.ref, noun), validate(req.body || {})));
    });
    api.delete(`/${name}/:ref`, async (req, res) => {
        await remove(assertRef(req.params.ref, noun));
        res.status(204).end();
    });
    api.post(`/${name}/:ref/photos`, upload.array('photos'), async (req, res) => {
        const id = await resolveId(name, assertRef(req.params.ref, noun));
        await addPhotos(name, id, uploadedFiles(req));
        res.status(201).json(await get(id));
    });
    api.put(`/${name}/:ref/photos/order`, async (req, res) => {
        const id = await resolveId(name, assertRef(req.params.ref, noun));
        await reorderPhotos(name, id, req.body?.ids);
        res.json(await get(id));
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
 *     responses:
 *       200:
 *         description: The updated part.
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
 *   delete:
 *     tags: [Parts]
 *     summary: Delete a part
 *     description: Deletes the part and its photos. To keep it on the Tossed list instead, use POST /parts/{ref}/toss.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     responses:
 *       204:
 *         description: Deleted.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
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
 *     responses:
 *       201:
 *         description: The part with its photos.
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
 * /parts/{ref}/photos/order:
 *   parameters:
 *     - $ref: '#/components/parameters/partRef'
 *   put:
 *     tags: [Parts, Photos]
 *     summary: Reorder a part's photos
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PhotoOrder'
 *     responses:
 *       200:
 *         description: The part with its photos in the new order.
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
 */
photoResource('parts', {
    noun: 'part id',
    list: (q) => parts.listParts(q),
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
 *       Moves the part to the Tossed list: creates a tossed record with its name, part number, key (unless another
 *       tossed record already uses that key, then none) and photos, then deletes the part and its task links. The
 *       body is optional.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PartTossInput'
 *     responses:
 *       201:
 *         description: The new tossed record.
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
 */
api.post('/parts/:ref/toss', async (req, res) => {
    const v = validateTossed({ reason: req.body?.reason ?? '', tossedOn: req.body?.tossedOn ?? null });
    const id = await parts.tossPart(assertRef(req.params.ref, 'part id'), v);
    res.status(201).json(await tossed.getTossed(id));
});

/**
 * @openapi
 * /containers:
 *   get:
 *     tags: [Containers]
 *     summary: List containers
 *     description: All containers, top-level and sub-containers, in display order (sortOrder, then oldest first).
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
 *     responses:
 *       200:
 *         description: The updated container.
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
 *   delete:
 *     tags: [Containers]
 *     summary: Delete a container
 *     description: Deletes the container and its photos. Parts in a sub-container move up to its parent; parts in a top-level container are left without a container, and its sub-containers become top-level.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     responses:
 *       204:
 *         description: Deleted.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
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
 *     responses:
 *       201:
 *         description: The container with its photos.
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
 * /containers/{ref}/photos/order:
 *   parameters:
 *     - $ref: '#/components/parameters/containerRef'
 *   put:
 *     tags: [Containers, Photos]
 *     summary: Reorder a container's photos
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PhotoOrder'
 *     responses:
 *       200:
 *         description: The container with its photos in the new order.
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
 *     responses:
 *       200:
 *         description: The updated tossed record.
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
 *   delete:
 *     tags: [Tossed]
 *     summary: Delete a tossed record
 *     description: Deletes the record and its photos.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     responses:
 *       204:
 *         description: Deleted.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
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
 *     responses:
 *       201:
 *         description: The tossed record with its photos.
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
 * /tossed/{ref}/photos/order:
 *   parameters:
 *     - $ref: '#/components/parameters/tossedRef'
 *   put:
 *     tags: [Tossed, Photos]
 *     summary: Reorder a tossed record's photos
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     requestBody:
 *       $ref: '#/components/requestBodies/PhotoOrder'
 *     responses:
 *       200:
 *         description: The tossed record with its photos in the new order.
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
 *     responses:
 *       200:
 *         description: The record the photo belonged to.
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
 */
api.delete('/photos/:id', async (req, res) => {
    const [table, id] = await deletePhoto(assertUuid(req.params.id, 'photo id'));
    const get = { parts: parts.getPart, containers: containers.getContainer, tossed: tossed.getTossed }[table];
    res.json(await get(id));
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
api.get('/tasks', async (_req, res) => {
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
    res.status(201).json(await tasks.createTask(validateTask(req.body || {}, { create: true })));
});
/**
 * @openapi
 * /tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get a task
 *     parameters:
 *       - $ref: '#/components/parameters/taskId'
 *     responses:
 *       200:
 *         description: The task.
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
api.get('/tasks/:id', async (req, res) => {
    res.json(await tasks.getTask(assertUuid(req.params.id)));
});
/**
 * @openapi
 * /tasks/{id}:
 *   patch:
 *     tags: [Tasks]
 *     summary: Update a task
 *     description: Changes only the fields sent; `partIds`, when sent, replaces the task's parts.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/taskId'
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
api.patch('/tasks/:id', async (req, res) => {
    res.json(await tasks.updateTask(assertUuid(req.params.id), validateTask(req.body || {})));
});
/**
 * @openapi
 * /tasks/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task
 *     description: The parts it used are not affected.
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/taskId'
 *     responses:
 *       204:
 *         description: Deleted.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
api.delete('/tasks/:id', async (req, res) => {
    await tasks.deleteTask(assertUuid(req.params.id));
    res.status(204).end();
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
api.get('/notes', async (_req, res) => {
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
 *       200:
 *         description: The note.
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
    res.json(await notes.getNote(assertRef(req.params.ref, 'note id')));
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
    res.status(201).json(await notes.createNote(validateNote(req.body || {}, { create: true })));
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
 */
api.patch('/notes/:ref', async (req, res) => {
    res.json(await notes.updateNote(assertRef(req.params.ref, 'note id'), validateNote(req.body || {})));
});
/**
 * @openapi
 * /notes/{ref}:
 *   delete:
 *     tags: [Notes]
 *     summary: Delete a note
 *     security: [{ bearerAuth: [] }, { apiKeyHeader: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/noteRef'
 *     responses:
 *       204:
 *         description: Deleted.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
api.delete('/notes/:ref', async (req, res) => {
    await notes.deleteNote(assertRef(req.params.ref, 'note id'));
    res.status(204).end();
});
