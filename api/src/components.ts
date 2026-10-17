// Shared OpenAPI components, read by swagger-jsdoc - see openapi.ts. The path blocks above each route
// in routes.ts refer to these with $ref, which keeps those blocks short: security schemes, parameters,
// the ETag header, request bodies, error responses and each record type's success responses.
// Schemas (the shapes) are in schemas.ts.
//
// Like schemas.ts this file is only comments, so tsc keeps them in dist/*.js, where the API reads them in
// production. Keep it free of code. `npm run lint:openapi` checks that dist/ yields the same document as src/.

// ---- security schemes, path and header parameters, the ETag header, photo bodies, error responses ----
/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       description: >-
 *         The access key (API_KEY) as `Authorization: Bearer <key>`. Needed for changes when API_KEY is set,
 *         and for reads too when API_KEY_FOR_READS=true.
 *     apiKeyHeader:
 *       type: apiKey
 *       in: header
 *       name: X-API-Key
 *       description: The same access key in an `X-API-Key` header (used when there is no Bearer header).
 *   parameters:
 *     partRef:
 *       name: ref
 *       in: path
 *       required: true
 *       description: The part's UUID or its key (e.g. `injen-intake`).
 *       schema:
 *         $ref: '#/components/schemas/Ref'
 *     containerRef:
 *       name: ref
 *       in: path
 *       required: true
 *       description: The container's UUID or its key.
 *       schema:
 *         $ref: '#/components/schemas/Ref'
 *     tossedRef:
 *       name: ref
 *       in: path
 *       required: true
 *       description: The tossed record's UUID or its key.
 *       schema:
 *         $ref: '#/components/schemas/Ref'
 *     noteRef:
 *       name: ref
 *       in: path
 *       required: true
 *       description: The note's UUID or its key.
 *       schema:
 *         $ref: '#/components/schemas/Ref'
 *     taskRef:
 *       name: ref
 *       in: path
 *       required: true
 *       description: The task's UUID or its key.
 *       schema:
 *         $ref: '#/components/schemas/Ref'
 *     ifMatch:
 *       name: If-Match
 *       in: header
 *       required: true
 *       description: >-
 *         The version of the record this change is based on, as `"3"`, `W/"3"` or `3` (a comma-separated list
 *         matches any of them; `*` matches any version). For DELETE /photos/{id}, the version of the record the
 *         photo belongs to. Missing: 428. Not the current version: 412.
 *       schema:
 *         type: string
 *       example: '"3"'
 *     includeDeleted:
 *       name: includeDeleted
 *       in: query
 *       description: '`1` (or `true`) also lists deleted records (tombstones, with `deletedAt` set).'
 *       schema:
 *         type: string
 *         enum: ['0', '1', 'false', 'true']
 *     photoId:
 *       name: id
 *       in: path
 *       required: true
 *       description: The photo's UUID.
 *       schema:
 *         type: string
 *         format: uuid
 *   headers:
 *     ETag:
 *       description: The record's version, quoted, e.g. `"3"`. Send it back in If-Match to change the record.
 *       schema:
 *         type: string
 *       example: '"3"'
 *   requestBodies:
 *     PhotoUpload:
 *       required: true
 *       description: One or more images in the `photos` field (at most 12, each under the configured MAX_UPLOAD_MB).
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/PhotoUpload'
 *     PhotoOrder:
 *       required: true
 *       description: >-
 *         The record's photo ids in the new order. Must list every photo of the record exactly once; the first is the
 *         main photo.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhotoOrder'
 *   responses:
 *     BadRequest:
 *       description: >-
 *         Invalid input: an invalid id or key, failed validation (`details` lists each field problem),
 *         a body that is not valid JSON, or a rejected upload (not an image, too large).
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: 'Check these fields:'
 *             details: [Name is required]
 *     Unauthorized:
 *       description: The access key is required and was missing or wrong.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: Enter the access key to make changes.
 *     NotFound:
 *       description: No record with that id or key.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: Part not found
 *     Conflict:
 *       description: The key is already used by another record of the same type.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: That key is already used by another record
 *     PreconditionFailed:
 *       description: >-
 *         The record has changed since the version sent in If-Match. Nothing was changed; `current` is the record
 *         as it is now (a Part, Container, Tossed, Task or Note).
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/Error'
 *               - type: object
 *                 required: [current]
 *                 properties:
 *                   current:
 *                     oneOf:
 *                       - $ref: '#/components/schemas/Part'
 *                       - $ref: '#/components/schemas/Container'
 *                       - $ref: '#/components/schemas/Tossed'
 *                       - $ref: '#/components/schemas/Task'
 *                       - $ref: '#/components/schemas/Note'
 *     PreconditionRequired:
 *       description: The If-Match header with the record's version is missing.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: 'This change needs the record''s version in an If-Match header, e.g. If-Match: "3"'
 *     UnsupportedPhoto:
 *       description: An uploaded file could not be decoded as an image.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: That file could not be read as a photo. Try a JPEG or PNG.
 */

// ---- GET /parts filters ----
/**
 * @openapi
 * components:
 *   parameters:
 *     partStatusFilter:
 *       name: status
 *       in: query
 *       description: Only parts with any of these statuses (repeat the parameter or separate with commas).
 *       style: form
 *       explode: true
 *       schema:
 *         type: array
 *         items:
 *           $ref: '#/components/schemas/PartStatus'
 *     partTagFilter:
 *       name: tag
 *       in: query
 *       description: >-
 *         Only parts with any of these tags (repeat or separate with commas). Special values: `Phase 1`..`Phase 4`
 *         match parts used by an open task in that phase; `Other cars` matches parts whose `fits` is set and is not
 *         `RSX`.
 *       style: form
 *       explode: true
 *       schema:
 *         type: array
 *         items:
 *           type: string
 *     partFitsFilter:
 *       name: fits
 *       in: query
 *       description: Only parts whose `fits` is exactly one of these values (repeat or separate with commas).
 *       style: form
 *       explode: true
 *       schema:
 *         type: array
 *         items:
 *           type: string
 *     partContainerFilter:
 *       name: container
 *       in: query
 *       description: >-
 *         A container UUID or key: parts in that container or its sub-containers (404 if there is no such container).
 *         `none` = parts not in any container.
 *       schema:
 *         type: string
 *     partSearch:
 *       name: q
 *       in: query
 *       description: Case-insensitive text search in name, part number, notes and tags.
 *       schema:
 *         type: string
 */

// ---- request bodies: create and update for each record type, and tossing a part ----
/**
 * @openapi
 * components:
 *   requestBodies:
 *     PartCreate:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/PartInput'
 *               - required: [label]
 *           example:
 *             { label: Injen cold air intake, key: injen-intake, status: Verified, tags: [Intake, For sale],
 *               valueLow: 150, valueHigh: 220, containerId: box-engine }
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
 *     PartUpdate:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PartInput'
 *     PartToss:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PartTossInput'
 *     ContainerCreate:
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
 *     ContainerUpdate:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContainerInput'
 *     TossedCreate:
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
 *     TossedUpdate:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TossedInput'
 *     TaskCreate:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/TaskInput'
 *               - required: [title]
 *           example: { title: Replace clutch master cylinder, phase: 1, partIds: [injen-intake] }
 *     TaskUpdate:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskInput'
 *           example: { done: true }
 *     NoteCreate:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/NoteInput'
 *               - required: [title]
 *           example: { title: Interior observations, items: [Driver seat bolster worn, Headliner sagging] }
 *     NoteUpdate:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NoteInput'
 */

// ---- success responses for each record type's routes ----
/**
 * @openapi
 * components:
 *   responses:
 *     PartList:
 *       description: The parts.
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/Part'
 *     PartCreated:
 *       description: The created part.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Part'
 *     Part:
 *       description: The part.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Part'
 *     PartUpdated:
 *       description: The updated part.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Part'
 *     Deleted:
 *       description: Deleted; the ETag is the tombstone's version.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *     PartPhotosAdded:
 *       description: The part with its photos.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Part'
 *     PartPhotosReordered:
 *       description: The part with its photos in the new order.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Part'
 *     TossedFromPart:
 *       description: The new tossed record.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Tossed'
 *     ContainerList:
 *       description: The containers.
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/Container'
 *     ContainerCreated:
 *       description: The created container.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Container'
 *     Container:
 *       description: The container.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Container'
 *     ContainerUpdated:
 *       description: The updated container.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Container'
 *     ContainerPhotosAdded:
 *       description: The container with its photos.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Container'
 *     ContainerPhotosReordered:
 *       description: The container with its photos in the new order.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Container'
 *     TossedList:
 *       description: The tossed records.
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/Tossed'
 *     TossedCreated:
 *       description: The created tossed record.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Tossed'
 *     Tossed:
 *       description: The tossed record.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Tossed'
 *     TossedUpdated:
 *       description: The updated tossed record.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Tossed'
 *     TossedPhotosAdded:
 *       description: The tossed record with its photos.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Tossed'
 *     TossedPhotosReordered:
 *       description: The tossed record with its photos in the new order.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Tossed'
 *     PhotoDeleted:
 *       description: The record the photo belonged to.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/Part'
 *               - $ref: '#/components/schemas/Container'
 *               - $ref: '#/components/schemas/Tossed'
 *     TaskList:
 *       description: The tasks.
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/Task'
 *     TaskCreated:
 *       description: The created task.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Task'
 *     Task:
 *       description: The task.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Task'
 *     TaskUpdated:
 *       description: The updated task.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Task'
 *     NoteList:
 *       description: The notes.
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/Note'
 *     Note:
 *       description: The note.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Note'
 *     NoteCreated:
 *       description: The created note.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Note'
 *     NoteUpdated:
 *       description: The updated note.
 *       headers:
 *         ETag:
 *           $ref: '#/components/headers/ETag'
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Note'
 */
