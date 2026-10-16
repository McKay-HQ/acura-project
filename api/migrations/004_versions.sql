-- Two-way sync (docs/sync-design.md): record versions, soft deletes, task keys, stable photo sources.

-- Every record has a version (starts at 1, bumped by the database on every change) and can be a
-- tombstone (deleted_at set). Keys stay unique including tombstones (the existing UNIQUE constraints).
ALTER TABLE parts      ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN deleted_at timestamptz;
ALTER TABLE containers ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN deleted_at timestamptz;
ALTER TABLE tossed     ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN deleted_at timestamptz;
ALTER TABLE tasks      ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN deleted_at timestamptz;
ALTER TABLE notes      ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN deleted_at timestamptz;

-- Tasks get a human-readable key like the other records (filled in at startup by backfill.ts).
ALTER TABLE tasks ADD COLUMN key text UNIQUE;

-- Every photo gets a stable, unique name: photos recorded without one are named after their id.
-- Photos still without a source get '<id>.jpg' at startup, after backfillPhotoSources has had the
-- chance to give them their catalog names (see src/backfill.ts).

-- version := OLD.version + 1 on any real change. An UPDATE that changes nothing but the version keeps
-- it (so several touches of a record within one transaction - e.g. one per photo - bump it once, since
-- now() is the same throughout a transaction). The version cannot be set directly. Maintenance code
-- can run `SET LOCAL app.no_bump = 'on'` to make changes without bumping (used by the task-key backfill).
CREATE FUNCTION bump_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF current_setting('app.no_bump', true) = 'on'
       OR (to_jsonb(NEW) - 'version') = (to_jsonb(OLD) - 'version') THEN
        NEW.version := OLD.version;
    ELSE
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER parts_version      BEFORE UPDATE ON parts      FOR EACH ROW EXECUTE FUNCTION bump_version();
CREATE TRIGGER containers_version BEFORE UPDATE ON containers FOR EACH ROW EXECUTE FUNCTION bump_version();
CREATE TRIGGER tossed_version     BEFORE UPDATE ON tossed     FOR EACH ROW EXECUTE FUNCTION bump_version();
CREATE TRIGGER tasks_version      BEFORE UPDATE ON tasks      FOR EACH ROW EXECUTE FUNCTION bump_version();
CREATE TRIGGER notes_version      BEFORE UPDATE ON notes      FOR EACH ROW EXECUTE FUNCTION bump_version();

-- Adding, removing, reordering or moving a photo changes the record that owns it (both owners on a move).
CREATE FUNCTION touch_photo_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE parts      SET updated_at = now() WHERE id = OLD.part_id;
        UPDATE containers SET updated_at = now() WHERE id = OLD.container_id;
        UPDATE tossed     SET updated_at = now() WHERE id = OLD.tossed_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE parts      SET updated_at = now() WHERE id = NEW.part_id;
        UPDATE containers SET updated_at = now() WHERE id = NEW.container_id;
        UPDATE tossed     SET updated_at = now() WHERE id = NEW.tossed_id;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER photos_touch_owner AFTER INSERT OR DELETE ON photos
    FOR EACH ROW EXECUTE FUNCTION touch_photo_owner();
CREATE TRIGGER photos_touch_owner_update AFTER UPDATE ON photos
    FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION touch_photo_owner();

-- Changing a task's linked parts changes the task.
CREATE FUNCTION touch_task_of_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE tasks SET updated_at = now() WHERE id = OLD.task_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE tasks SET updated_at = now() WHERE id = NEW.task_id;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER task_parts_touch_task AFTER INSERT OR DELETE ON task_parts
    FOR EACH ROW EXECUTE FUNCTION touch_task_of_link();
CREATE TRIGGER task_parts_touch_task_update AFTER UPDATE ON task_parts
    FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION touch_task_of_link();
