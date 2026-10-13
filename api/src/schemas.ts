// OpenAPI component schemas for the API shapes and inputs declared in types.ts (one block per type,
// in the same order), read by swagger-jsdoc - see openapi.ts.
//
// They live in this comment-only file rather than above each interface in types.ts because tsc drops
// comments attached to type-only declarations, and the API reads these blocks from dist/*.js in
// production. Keep this file free of code: tsc keeps a file's comments only when they trail its last
// statement. `npm run lint:openapi` checks that dist/ yields the same document as src/.

// ---- PartStatus, Phase, ContainerIcon; ids and keys ----
/**
 * @openapi
 * components:
 *   schemas:
 *     PartStatus:
 *       type: string
 *       enum: [Verified, Unverified, Unknown]
 *       description: Whether the part is confirmed to fit the car.
 *     Phase:
 *       type: integer
 *       enum: [1, 2, 3, 4]
 *       description: 'Task phase: 1 Before Driving, 2 Priority, 3 Non-Priority, 4 Performance.'
 *     ContainerIcon:
 *       type: string
 *       enum: [trim, engine, electrical, other, askcody, none, hardware, box]
 *     Ref:
 *       type: string
 *       description: A record's UUID or its human-readable key.
 *       pattern: '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[a-z0-9][a-z0-9._-]{0,79})$'
 *       example: injen-intake
 *     Key:
 *       type: string
 *       nullable: true
 *       description: >-
 *         Optional human-readable id, unique per record type: lowercase letters, numbers, dots, dashes or
 *         underscores, starting with a letter or number, up to 80 characters (input is trimmed and lowercased;
 *         it cannot look like a UUID). `null` or `''` removes it.
 *       example: injen-intake
 */

// ---- Photo; photo upload and order bodies ----
/**
 * @openapi
 * components:
 *   schemas:
 *     Photo:
 *       type: object
 *       required: [id, url, thumbUrl, width, height]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         url:
 *           type: string
 *           description: Full-size JPEG, served by this server.
 *           example: /uploads/0b4c6c86-5d2b-4a8e-9a6f-1f3d0c7e2a11.jpg
 *         thumbUrl:
 *           type: string
 *           description: Thumbnail JPEG.
 *           example: /uploads/0b4c6c86-5d2b-4a8e-9a6f-1f3d0c7e2a11_t.jpg
 *         width:
 *           type: integer
 *           nullable: true
 *         height:
 *           type: integer
 *           nullable: true
 *     PhotoUpload:
 *       type: object
 *       required: [photos]
 *       properties:
 *         photos:
 *           type: array
 *           maxItems: 12
 *           items:
 *             type: string
 *             format: binary
 *     PhotoOrder:
 *       type: object
 *       required: [ids]
 *       properties:
 *         ids:
 *           type: array
 *           items:
 *             type: string
 *             format: uuid
 */

// ---- PartTaskRef ----
/**
 * @openapi
 * components:
 *   schemas:
 *     PartTaskRef:
 *       type: object
 *       description: A task that uses this part.
 *       required: [id, title, phase, done]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         title:
 *           type: string
 *         phase:
 *           $ref: '#/components/schemas/Phase'
 *         done:
 *           type: boolean
 */

// ---- ContainerRef ----
/**
 * @openapi
 * components:
 *   schemas:
 *     ContainerRef:
 *       type: object
 *       required: [id, key, name, icon]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         key:
 *           type: string
 *           nullable: true
 *         name:
 *           type: string
 *         icon:
 *           $ref: '#/components/schemas/ContainerIcon'
 */

// ---- PartContainer ----
/**
 * @openapi
 * components:
 *   schemas:
 *     PartContainer:
 *       description: The container a part is in. `top` is its top-level container (the same container when it is top-level).
 *       allOf:
 *         - $ref: '#/components/schemas/ContainerRef'
 *         - type: object
 *           required: [top]
 *           properties:
 *             top:
 *               $ref: '#/components/schemas/ContainerRef'
 */

// ---- Part ----
/**
 * @openapi
 * components:
 *   schemas:
 *     Part:
 *       type: object
 *       required: [id, key, label, partNumber, fits, status, tags, valueLow, valueHigh, notes, container, tasks, phaseTags, photos, createdAt, updatedAt]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         key:
 *           type: string
 *           nullable: true
 *           example: injen-intake
 *         label:
 *           type: string
 *           description: The part's name.
 *         partNumber:
 *           type: string
 *         fits:
 *           type: string
 *           description: What it fits, e.g. `RSX` (empty when unknown).
 *         status:
 *           $ref: '#/components/schemas/PartStatus'
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         valueLow:
 *           type: number
 *           nullable: true
 *           description: Estimated value range, low end.
 *         valueHigh:
 *           type: number
 *           nullable: true
 *         notes:
 *           type: string
 *         container:
 *           allOf:
 *             - $ref: '#/components/schemas/PartContainer'
 *           nullable: true
 *           description: Where the part is stored; null when it is not in a container.
 *         tasks:
 *           type: array
 *           description: Tasks that use this part, by phase.
 *           items:
 *             $ref: '#/components/schemas/PartTaskRef'
 *         phaseTags:
 *           type: array
 *           description: '"Phase N" for each phase with an open task that uses this part, sorted.'
 *           items:
 *             type: string
 *           example: [Phase 1]
 *         photos:
 *           type: array
 *           description: In display order; the first is the main photo.
 *           items:
 *             $ref: '#/components/schemas/Photo'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// ---- TagCount (Tag) ----
/**
 * @openapi
 * components:
 *   schemas:
 *     Tag:
 *       type: object
 *       required: [tag, count]
 *       properties:
 *         tag:
 *           type: string
 *           description: A part tag, or a "Phase N" tag from open tasks.
 *         count:
 *           type: integer
 *           description: Number of parts with this tag.
 */

// ---- ContainerPartRef ----
/**
 * @openapi
 * components:
 *   schemas:
 *     ContainerPartRef:
 *       type: object
 *       required: [id, key, label, status]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         key:
 *           type: string
 *           nullable: true
 *         label:
 *           type: string
 *         status:
 *           $ref: '#/components/schemas/PartStatus'
 */

// ---- Container ----
/**
 * @openapi
 * components:
 *   schemas:
 *     Container:
 *       type: object
 *       required: [id, key, name, location, notes, parentId, icon, sortOrder, photos, parts, partCount, createdAt, updatedAt]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         key:
 *           type: string
 *           nullable: true
 *         name:
 *           type: string
 *         location:
 *           type: string
 *         notes:
 *           type: string
 *         parentId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: The top-level container this one is inside; null for a top-level container.
 *         icon:
 *           $ref: '#/components/schemas/ContainerIcon'
 *         sortOrder:
 *           type: integer
 *         photos:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Photo'
 *         parts:
 *           type: array
 *           description: Parts directly in this container (not in its sub-containers), by name.
 *           items:
 *             $ref: '#/components/schemas/ContainerPartRef'
 *         partCount:
 *           type: integer
 *           description: Length of `parts`.
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// ---- Tossed ----
/**
 * @openapi
 * components:
 *   schemas:
 *     Tossed:
 *       type: object
 *       required: [id, key, label, partNumber, reason, tossedOn, photos, createdAt, updatedAt]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         key:
 *           type: string
 *           nullable: true
 *         label:
 *           type: string
 *         partNumber:
 *           type: string
 *         reason:
 *           type: string
 *         tossedOn:
 *           type: string
 *           format: date
 *           nullable: true
 *         photos:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Photo'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// ---- TaskPartRef ----
/**
 * @openapi
 * components:
 *   schemas:
 *     TaskPartRef:
 *       type: object
 *       description: A part the task needs.
 *       required: [id, key, label, partNumber, status]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         key:
 *           type: string
 *           nullable: true
 *         label:
 *           type: string
 *         partNumber:
 *           type: string
 *         status:
 *           $ref: '#/components/schemas/PartStatus'
 */

// ---- Task ----
/**
 * @openapi
 * components:
 *   schemas:
 *     Task:
 *       type: object
 *       required: [id, title, phase, notes, done, doneAt, parts, createdAt, updatedAt]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         title:
 *           type: string
 *         phase:
 *           $ref: '#/components/schemas/Phase'
 *         notes:
 *           type: string
 *         done:
 *           type: boolean
 *         doneAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When the task was marked done; null while open.
 *         parts:
 *           type: array
 *           description: Parts the task needs, in the order given.
 *           items:
 *             $ref: '#/components/schemas/TaskPartRef'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// ---- Note ----
/**
 * @openapi
 * components:
 *   schemas:
 *     Note:
 *       type: object
 *       required: [id, key, title, items, createdAt, updatedAt]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         key:
 *           type: string
 *           nullable: true
 *         title:
 *           type: string
 *         items:
 *           type: array
 *           items:
 *             type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// ---- Summary ----
/**
 * @openapi
 * components:
 *   schemas:
 *     Summary:
 *       type: object
 *       description: >-
 *         Totals for the page header. Value sums use the low (or high, when only that is set) estimate for `low`,
 *         and the reverse for `high`. "For sale" counts parts tagged `For sale`; `containers` counts top-level containers.
 *       required: [parts, value, forSale, containers, tossed, tasks]
 *       properties:
 *         parts:
 *           type: object
 *           required: [total, verified, unverified, unknown]
 *           properties:
 *             total:
 *               type: integer
 *             verified:
 *               type: integer
 *             unverified:
 *               type: integer
 *             unknown:
 *               type: integer
 *         value:
 *           type: object
 *           required: [low, high]
 *           properties:
 *             low:
 *               type: number
 *             high:
 *               type: number
 *         forSale:
 *           type: object
 *           required: [count, low, high]
 *           properties:
 *             count:
 *               type: integer
 *             low:
 *               type: number
 *             high:
 *               type: number
 *         containers:
 *           type: integer
 *         tossed:
 *           type: integer
 *         tasks:
 *           type: object
 *           required: [open, total]
 *           properties:
 *             open:
 *               type: integer
 *             total:
 *               type: integer
 */

// ---- PartInput ----
/**
 * @openapi
 * components:
 *   schemas:
 *     PartInput:
 *       type: object
 *       description: >-
 *         Fields to set; omitted fields are left unchanged (on create they get their defaults: status
 *         `Unverified`, empty text and tags, no values, no container). Text fields are trimmed.
 *       properties:
 *         key:
 *           $ref: '#/components/schemas/Key'
 *         label:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *           description: The part's name. Required on create; can't be set to empty.
 *         partNumber:
 *           type: string
 *           nullable: true
 *           maxLength: 300
 *           description: '`null` is stored as an empty string (as for the other optional text fields).'
 *         fits:
 *           type: string
 *           nullable: true
 *           maxLength: 60
 *         status:
 *           $ref: '#/components/schemas/PartStatus'
 *         tags:
 *           type: array
 *           maxItems: 30
 *           description: >-
 *             Replaces the part's tags. Duplicates and blanks are dropped. A comma-separated string or a JSON array
 *             string is also accepted (handy in multipart forms); `null` or `''` clears the tags.
 *           items:
 *             type: string
 *             maxLength: 40
 *         valueLow:
 *           type: number
 *           nullable: true
 *           minimum: 0
 *           maximum: 99999999
 *           description: Rounded to cents. Numeric strings are accepted; `null` or `''` clears it. Must not exceed valueHigh.
 *         valueHigh:
 *           type: number
 *           nullable: true
 *           minimum: 0
 *           maximum: 99999999
 *         notes:
 *           type: string
 *           nullable: true
 *           maxLength: 5000
 *         containerId:
 *           type: string
 *           nullable: true
 *           description: The container's UUID or key; `null` or `''` takes the part out of its container.
 *         container:
 *           type: string
 *           nullable: true
 *           description: Alias for `containerId`, used only when `containerId` is not sent.
 */

// ---- ContainerInput ----
/**
 * @openapi
 * components:
 *   schemas:
 *     ContainerInput:
 *       type: object
 *       description: Fields to set; omitted fields are left unchanged (on create, icon defaults to `box` and sortOrder to 0).
 *       properties:
 *         key:
 *           $ref: '#/components/schemas/Key'
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 120
 *           description: Required on create; can't be set to empty.
 *         location:
 *           type: string
 *           nullable: true
 *           maxLength: 200
 *         notes:
 *           type: string
 *           nullable: true
 *           maxLength: 5000
 *         parentId:
 *           type: string
 *           nullable: true
 *           description: >-
 *             UUID or key of the top-level container to put this one inside (one level deep only; a container
 *             with sub-containers must stay top-level). `null` or `''` makes it top-level.
 *         icon:
 *           $ref: '#/components/schemas/ContainerIcon'
 *         sortOrder:
 *           type: integer
 *           minimum: 0
 *           maximum: 9999
 */

// ---- TossedInput; POST /parts/{ref}/toss body ----
/**
 * @openapi
 * components:
 *   schemas:
 *     TossedInput:
 *       type: object
 *       description: Fields to set; omitted fields are left unchanged.
 *       properties:
 *         key:
 *           $ref: '#/components/schemas/Key'
 *         label:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *           description: Required on create; can't be set to empty.
 *         partNumber:
 *           type: string
 *           nullable: true
 *           maxLength: 300
 *         reason:
 *           type: string
 *           nullable: true
 *           maxLength: 2000
 *         tossedOn:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: A date like `2026-10-06`. On create it defaults to today when omitted; `null` or `''` leaves it empty.
 *     PartTossInput:
 *       type: object
 *       properties:
 *         reason:
 *           type: string
 *           nullable: true
 *           maxLength: 2000
 *           description: Why it was tossed. Defaults to empty.
 *         tossedOn:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Defaults to today when omitted, `null` or `''`.
 */

// ---- TaskInput ----
/**
 * @openapi
 * components:
 *   schemas:
 *     TaskInput:
 *       type: object
 *       description: Fields to set; omitted fields are left unchanged (on create, phase defaults to 1 and done to false).
 *       properties:
 *         title:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *           description: Required on create; can't be set to empty.
 *         phase:
 *           $ref: '#/components/schemas/Phase'
 *         notes:
 *           type: string
 *           nullable: true
 *           maxLength: 5000
 *         done:
 *           type: boolean
 *           description: >-
 *             Marking a task done sets doneAt (kept if it was already done); marking it open clears doneAt.
 *             Must be `true` or `false` (the strings "true" and "false" are accepted too); anything else is a 400.
 *         partIds:
 *           type: array
 *           maxItems: 200
 *           description: >-
 *             Replaces the task's parts, in this order: part UUIDs or keys (duplicates are dropped). A comma-separated
 *             string is also accepted; `null`, `''` or `[]` removes all parts.
 *           items:
 *             type: string
 */

// ---- NoteInput ----
/**
 * @openapi
 * components:
 *   schemas:
 *     NoteInput:
 *       type: object
 *       description: Fields to set; omitted fields are left unchanged.
 *       properties:
 *         key:
 *           $ref: '#/components/schemas/Key'
 *         title:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *           description: Required on create; can't be set to empty.
 *         items:
 *           type: array
 *           maxItems: 200
 *           description: >-
 *             Replaces the note's items. Items are trimmed and blank ones dropped (duplicates are kept). A plain string
 *             is split on commas; `null` or `''` clears the list.
 *           items:
 *             type: string
 *             maxLength: 2000
 */
