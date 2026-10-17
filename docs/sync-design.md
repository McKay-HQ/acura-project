# Two-way sync: design

The catalog (the RSX Type-S Project artifact on claude.ai) and the app (Azure) are edited independently and kept in step by `bin/sync`. Nothing can reach both ends directly: the artifact is only reachable from Claude, the app only from your machine. The repo is the bridge:

```
artifact  ⇄ (Claude: tools/artifact)  ⇄  repo: api/seed/  ⇄ (you: bin/sync)  ⇄  app API
```

- **Catalog → app:** Claude exports the artifact into `api/seed/` and pushes; you run `./bin/sync`.
- **App → catalog:** you run `./bin/sync`; it pulls app changes into `api/seed/`, commits and pushes; Claude imports them into the artifact.

## Why not an off-the-shelf sync engine

ElectricSQL, PowerSync, Replicache and CRDT libraries (Automerge, Yjs) assume both replicas can talk to a sync server. The artifact can't, so the bridge stays a file in git. Inside each piece the work leans on existing tools: Postgres triggers for versioning, standard HTTP preconditions (`ETag`, `If-Match`, 412, 428) for conflict detection, `@sindresorhus/slugify` for keys, and Python's standard library for the sync (nothing to install).

## API contract

**Records:** parts, containers, tossed, tasks, notes.

- Every record has a `version` (integer, starts at 1) and a `key` (tasks now too). Responses include both.
- The database bumps `version` on every change to the record, including its photos (add, remove, reorder) and a task's linked parts. Triggers do this, so no code path can forget.
- Single-record responses carry `ETag: "<version>"`.
- **Writes to an existing record need `If-Match: "<version>"`** (a bare number or `W/"n"` is accepted too): `PATCH` and `DELETE /<type>/{ref}`, `POST /parts/{ref}/toss`, `POST /<type>/{ref}/photos`, `PUT /<type>/{ref}/photos/order`, and `DELETE /photos/{id}` (the owning record's version).
  - Header missing: **428 Precondition Required**.
  - Version doesn't match: **412 Precondition Failed**, nothing changes, and the body includes the current record (`current`).
- Creating a record needs no version. A key is generated from the label/name/title when none is given.
- **Deletes are soft:** the record gets `deletedAt` and a version bump, disappears from normal reads (404 on GET), and its key stays reserved. List endpoints accept `?includeDeleted=1` to include these tombstones, which the sync uses to propagate deletes.
- **Photo `source`:** an uploaded file named like a catalog photo (`<32 hex>.jpg`) keeps that name; anything else is recorded as `<photo id>.jpg`. Every photo therefore has a stable, unique name on both sides.

## Sync rules (3-way)

`api/seed/sync-state.json` records, per record, the app `version` and the content (`base`) at the last sync. For each record, compare the catalog and the app with that base:

| Catalog vs base | App vs base | Action |
|---|---|---|
| same | same | nothing |
| changed | same | push to the app with `If-Match: base version` (a 412 means someone just edited it: conflict) |
| same | changed | pull into the catalog |
| changed | changed | merge field by field when different fields changed; a field changed on both sides to different values is a **conflict**: reported, nothing changed for that record (or settled with `-c` / `-a`) |

Task steps (`steps`: text, done, links, photos) compare as one field, and a task with steps is done exactly when all its steps are; the API enforces that.

Creates and deletes follow the same table, with "missing" as the change. Photos compare as an ordered list of `source` names. Pulled photos are downloaded into `api/seed/photos/`.

A record with no base yet (first run) is treated as in sync if both sides match, otherwise as a catalog change.
