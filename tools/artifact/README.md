# tools/artifact

Claude's half of the catalog sync: moving data between the RSX Type-S Project artifact (claude.ai) and the repo catalog in `api/seed/`. Only Claude can reach the artifact, so these run in Claude's workspace. See [docs/sync-design.md](../../docs/sync-design.md).

**Artifact → repo (before you run `bin/sync`):**

1. Dump the five collections (containers, parts, tossed, tasks, notes) with `ArtifactData list ... out_dir=<dump>`.
2. `python3 -I tools/artifact/export.py <dump> api/seed/seed.json > new.json`, then replace `api/seed/seed.json` with it.
3. Copy any new artifact photos into `api/seed/photos/<asset id>.jpg` (`Artifact read path=<asset id>`).
4. Commit and push.

**Repo → artifact (after `bin/sync` pulled app changes):**

1. `git pull`, and dump the artifact as above.
2. `python3 -I tools/artifact/import.py uploads <dump> api/seed/seed.json` lists photos to upload; upload them from `api/seed/photos/` as artifact assets and save `{file name: asset id}` as `assets.json`.
3. `python3 -I tools/artifact/import.py writes <dump> api/seed/seed.json assets.json` prints the writes; apply them with `ArtifactData batch`, adding each doc's `if_version` from the dump listing.
4. Delete assets no longer referenced by any doc.
