-- Sub-containers, container icons and order; "Unknown" status; task phases and linked parts.

-- Containers can sit inside one top-level container (one level deep).
ALTER TABLE containers
    ADD COLUMN parent_id  uuid REFERENCES containers (id) ON DELETE SET NULL,
    ADD COLUMN icon       text NOT NULL DEFAULT 'box',
    ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
    ADD CONSTRAINT not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);
CREATE INDEX containers_parent_idx ON containers (parent_id, sort_order);

-- "Unidentified" is now called "Unknown".
ALTER TABLE parts DROP CONSTRAINT IF EXISTS parts_status_check;
UPDATE parts SET status = 'Unknown' WHERE status = 'Unidentified';
ALTER TABLE parts ADD CONSTRAINT parts_status_check CHECK (status IN ('Verified', 'Unverified', 'Unknown'));

-- Tasks move from priorities to four phases:
--   1 Before Driving, 2 Priority, 3 Non-Priority, 4 Performance.
ALTER TABLE tasks ADD COLUMN phase smallint NOT NULL DEFAULT 3 CHECK (phase BETWEEN 1 AND 4);
UPDATE tasks SET phase = CASE priority WHEN 'Before driving' THEN 1 WHEN 'Soon' THEN 2 ELSE 3 END;
ALTER TABLE tasks DROP COLUMN priority;

-- Parts needed for a task.
CREATE TABLE task_parts (
    task_id    uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    part_id    uuid NOT NULL REFERENCES parts (id) ON DELETE CASCADE,
    sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (task_id, part_id)
);
CREATE INDEX task_parts_part_idx ON task_parts (part_id);
