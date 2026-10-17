// OpenAPI documentation: the spec is assembled by swagger-jsdoc from the `@openapi` JSDoc blocks
// in this folder (paths above each route in routes.ts, their parameters, request bodies and responses in
// components.ts, schemas in schemas.ts), once at startup,
// and served as GET /api/openapi.json plus a Swagger UI at /api/docs/.
//
// The blocks are read from the files that are actually running: src/*.ts under tsx, dist/*.js after
// tsc (which keeps comments as long as "removeComments" stays off in tsconfig.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const here = fileURLToPath(import.meta.url);
const dir = path.dirname(here);
// ".ts" when run from src/ by tsx, ".js" when run from dist/.
const ext = path.extname(here);

/** package.json sits one level above both src/ and dist/. */
function packageVersion(): string {
    const pkg: unknown = JSON.parse(fs.readFileSync(path.resolve(dir, '../package.json'), 'utf8'));
    const version = typeof pkg === 'object' && pkg !== null && 'version' in pkg ? pkg.version : undefined;
    return typeof version === 'string' ? version : '0.0.0';
}

const description = `
Parts, containers, tossed parts, tasks and notes for the Acura RSX Type-S project.

**Access key.** The API has an optional access key (the \`API_KEY\` setting):

- Without \`API_KEY\` everything is open.
- With \`API_KEY\` set, every change (POST, PATCH, PUT, DELETE) needs the key, sent as
  \`Authorization: Bearer <key>\` or \`X-API-Key: <key>\`. Viewing (GET) stays open
  unless \`API_KEY_FOR_READS=true\` is also set, in which case reads need the key too.
- \`/health\`, \`/config\`, \`/auth/check\`, this spec (\`/openapi.json\`) and these docs (\`/docs/\`) are always open.

Use **Authorize** to enter the key once; it is then sent with every request tried from this page.

**Ids.** Path ids accept the record's UUID or its human-readable \`key\` (e.g. \`injen-intake\`),
except photos, which only have UUIDs. A key is generated from the name when a record is created without one.

**Versions.** Parts, containers, tossed records, tasks and notes have a \`version\` (starting at 1) that the
database bumps on every change, including adding, removing or reordering photos and changing a task's parts.
Single-record responses carry it as \`ETag: "<version>"\`. Changing or deleting an existing record (PATCH,
DELETE, toss, photo upload, reorder and delete) needs \`If-Match: "<version>"\` (a bare number or \`W/"n"\` works
too): without it the answer is 428; if the record has changed since, 412 with the current record in \`current\`,
and nothing is changed.

**Deletes are soft.** A deleted record keeps its key and gets \`deletedAt\`; it is left out of every read
(GET by id is a 404) except lists with \`includeDeleted=1\`.

**Errors** are JSON: \`{ "error": "message" }\`, plus \`details\` (a list of field problems) for validation errors.

**Photos** are uploaded as \`multipart/form-data\` in a field named \`photos\` (up to 12 images per request).
The server auto-rotates, resizes and re-encodes them as JPEG and makes a thumbnail; the returned
\`url\`/\`thumbUrl\` are served from \`/uploads/\`.
`.trim();

const definition: swaggerJsdoc.OAS3Definition = {
    openapi: '3.0.3',
    info: { title: 'RSX Type-S Project API', version: packageVersion(), description },
    servers: [{ url: '/api' }],
    tags: [
        { name: 'Parts', description: 'Parts kept, spare, for sale or still unknown' },
        { name: 'Containers', description: 'Boxes and bins parts are stored in (one level of sub-containers)' },
        { name: 'Tossed', description: 'Parts thrown away, kept for reference' },
        { name: 'Tasks', description: 'Work to do on the car, in four phases' },
        { name: 'Notes', description: 'Titled lists of observations' },
        { name: 'Photos', description: 'Photo order and deletion (uploads are under each record type)' },
        { name: 'System', description: 'Health, app configuration, access key check, tags, totals and these docs' },
    ],
    // Reads work without a key unless API_KEY_FOR_READS is set, so the key is optional by default
    // (`{}` = no auth); writes override this with the key required.
    security: [{}, { bearerAuth: [] }, { apiKeyHeader: [] }],
};

/** Build the OpenAPI document from the `@openapi` blocks; throws on malformed YAML. */
export function buildSpec(): object {
    // swagger-jsdoc globs need forward slashes.
    const pattern = path.join(dir, `**/*${ext}`).split(path.sep).join('/');
    return swaggerJsdoc({ definition, apis: [pattern], failOnErrors: true });
}

export const spec = buildSpec();

const uiOptions: swaggerUi.SwaggerUiOptions = {
    customSiteTitle: 'RSX Type-S Project API',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
};

/**
 * GET /openapi.json and the Swagger UI under /docs/. Mounted on the /api router ahead of requireKey,
 * so both stay reachable when an access key is required.
 */
export const docs = express.Router();

/**
 * @openapi
 * /openapi.json:
 *   get:
 *     tags: [System]
 *     summary: This OpenAPI document
 *     description: Always open, even when an access key is required.
 *     security: []
 *     responses:
 *       200:
 *         description: The OpenAPI 3 document describing this API.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
docs.get('/openapi.json', (_req, res) => {
    res.json(spec);
});

/**
 * @openapi
 * /docs/:
 *   get:
 *     tags: [System]
 *     summary: Swagger UI for this API
 *     description: Interactive documentation (this page). `/docs` without the slash redirects here. Always open.
 *     security: []
 *     responses:
 *       200:
 *         description: The Swagger UI page.
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
// The UI's HTML loads its CSS and JS with relative URLs ("./swagger-ui.css"), which only resolve
// under /docs/ - so send /docs to /docs/ first. The relative Location works behind any path prefix.
docs.get('/docs', (req, res, next) => {
    const [pathname, query] = req.originalUrl.split(/\?(.*)/s);
    if (pathname.endsWith('/')) return next();
    res.redirect(302, `docs/${query ? `?${query}` : ''}`);
});
docs.use('/docs', swaggerUi.serveFiles(spec, uiOptions), swaggerUi.setup(spec, uiOptions));
