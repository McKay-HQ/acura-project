import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { query } from './db.js';
import {
  assertRef, assertUuid, validatePart, validateContainer, validateTossed, validateTask, validateNote, STATUSES, PHASES, ICONS,
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(badRequest(`${file.originalname} is not an image`)),
});

export const api = express.Router();
api.use(requireKey);

api.get('/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

// Tells the web app whether it needs to ask for the access key.
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

api.post('/auth/check', (req, res) => {
  res.json({ ok: !config.apiKey || keyMatches(presentedKey(req)) });
});

api.get('/summary', async (_req, res) => res.json(await getSummary()));
api.get('/tags', async (_req, res) => res.json(await parts.listTags()));

/**
 * Standard routes for a record type with photos:
 *   GET /<name>, GET /<name>/:ref, POST /<name> (JSON, or multipart with "photos" files),
 *   PATCH /<name>/:ref, DELETE /<name>/:ref,
 *   POST /<name>/:ref/photos (multipart "photos"), PUT /<name>/:ref/photos/order { ids: [...] }
 * :ref is a UUID or the record's key.
 */
function photoResource(name, { list, get, create, update, remove, validate, noun }) {
  api.get(`/${name}`, async (req, res) => res.json(await list(req.query)));
  api.get(`/${name}/:ref`, async (req, res) => res.json(await get(assertRef(req.params.ref, noun))));
  api.post(`/${name}`, upload.array('photos'), async (req, res) => {
    res.status(201).json(await create(validate(req.body || {}, { create: true }), req.files));
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
    await addPhotos(name, id, req.files);
    res.status(201).json(await get(id));
  });
  api.put(`/${name}/:ref/photos/order`, async (req, res) => {
    const id = await resolveId(name, assertRef(req.params.ref, noun));
    await reorderPhotos(name, id, req.body?.ids);
    res.json(await get(id));
  });
}

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
api.post('/parts/:ref/toss', async (req, res) => {
  const v = validateTossed({ reason: req.body?.reason ?? '', tossedOn: req.body?.tossedOn ?? null });
  const id = await parts.tossPart(assertRef(req.params.ref, 'part id'), v);
  res.status(201).json(await tossed.getTossed(id));
});

photoResource('containers', {
  noun: 'container id',
  list: () => containers.listContainers(),
  get: containers.getContainer,
  create: containers.createContainer,
  update: containers.updateContainer,
  remove: containers.deleteContainer,
  validate: validateContainer,
});

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
api.delete('/photos/:id', async (req, res) => {
  const [table, id] = await deletePhoto(assertUuid(req.params.id, 'photo id'));
  const get = { parts: parts.getPart, containers: containers.getContainer, tossed: tossed.getTossed }[table];
  res.json(await get(id));
});

// ---- tasks ----
api.get('/tasks', async (_req, res) => res.json(await tasks.listTasks()));
api.post('/tasks', async (req, res) => {
  res.status(201).json(await tasks.createTask(validateTask(req.body || {}, { create: true })));
});
api.get('/tasks/:id', async (req, res) => res.json(await tasks.getTask(assertUuid(req.params.id))));
api.patch('/tasks/:id', async (req, res) => {
  res.json(await tasks.updateTask(assertUuid(req.params.id), validateTask(req.body || {})));
});
api.delete('/tasks/:id', async (req, res) => {
  await tasks.deleteTask(assertUuid(req.params.id));
  res.status(204).end();
});

// ---- notes ----
api.get('/notes', async (_req, res) => res.json(await notes.listNotes()));
api.get('/notes/:ref', async (req, res) => res.json(await notes.getNote(assertRef(req.params.ref, 'note id'))));
api.post('/notes', async (req, res) => {
  res.status(201).json(await notes.createNote(validateNote(req.body || {}, { create: true })));
});
api.patch('/notes/:ref', async (req, res) => {
  res.json(await notes.updateNote(assertRef(req.params.ref, 'note id'), validateNote(req.body || {})));
});
api.delete('/notes/:ref', async (req, res) => {
  await notes.deleteNote(assertRef(req.params.ref, 'note id'));
  res.status(204).end();
});
