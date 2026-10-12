-- RSX Garage schema.
-- Parts carry a fit status (Verified / Unverified / Unidentified), free-form tags
-- (category, Spare, For sale, Potential sale ...), an estimated value range, and the
-- container they are stored in. Tossed parts are kept as a separate reference list.

CREATE TABLE containers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key         text UNIQUE,  -- optional human-readable id, e.g. "box-engine"
    name        text NOT NULL CHECK (length(trim(name)) > 0),
    location    text NOT NULL DEFAULT '',
    notes       text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key           text UNIQUE,  -- optional human-readable id, e.g. "injen-intake"
    label         text NOT NULL CHECK (length(trim(label)) > 0),
    part_number   text NOT NULL DEFAULT '',
    fits          text NOT NULL DEFAULT '',
    status        text NOT NULL DEFAULT 'Unverified'
                  CHECK (status IN ('Verified', 'Unverified', 'Unidentified')),
    tags          text[] NOT NULL DEFAULT '{}',
    value_low     numeric(10, 2) CHECK (value_low IS NULL OR value_low >= 0),
    value_high    numeric(10, 2) CHECK (value_high IS NULL OR value_high >= 0),
    notes         text NOT NULL DEFAULT '',
    container_id  uuid REFERENCES containers (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT value_range CHECK (value_low IS NULL OR value_high IS NULL OR value_low <= value_high)
);
CREATE INDEX parts_created_idx ON parts (created_at);
CREATE INDEX parts_container_idx ON parts (container_id);
CREATE INDEX parts_tags_idx ON parts USING gin (tags);

CREATE TABLE tossed (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key          text UNIQUE,
    label        text NOT NULL CHECK (length(trim(label)) > 0),
    part_number  text NOT NULL DEFAULT '',
    reason       text NOT NULL DEFAULT '',
    tossed_on    date,
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- A photo belongs to exactly one part, container or tossed record.
CREATE TABLE photos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id         uuid REFERENCES parts (id) ON DELETE CASCADE,
    container_id    uuid REFERENCES containers (id) ON DELETE CASCADE,
    tossed_id       uuid REFERENCES tossed (id) ON DELETE CASCADE,
    filename        text NOT NULL UNIQUE,
    thumb_filename  text NOT NULL UNIQUE,
    width           integer,
    height          integer,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT one_owner CHECK (num_nonnulls(part_id, container_id, tossed_id) = 1)
);
CREATE INDEX photos_part_idx ON photos (part_id, sort_order);
CREATE INDEX photos_container_idx ON photos (container_id, sort_order);
CREATE INDEX photos_tossed_idx ON photos (tossed_id, sort_order);

CREATE TABLE tasks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title       text NOT NULL CHECK (length(trim(title)) > 0),
    priority    text NOT NULL DEFAULT 'Later' CHECK (priority IN ('Before driving', 'Soon', 'Later')),
    notes       text NOT NULL DEFAULT '',
    done        boolean NOT NULL DEFAULT false,
    done_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Free-form observation lists (e.g. "Interior observations"), each a title plus bullet items.
CREATE TABLE notes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key         text UNIQUE,
    title       text NOT NULL CHECK (length(trim(title)) > 0),
    items       text[] NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Small key/value table for app state, e.g. whether the seed import has run.
CREATE TABLE app_meta (
    key    text PRIMARY KEY,
    value  text NOT NULL
);
