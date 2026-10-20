-- Purchases and expenses: what the project has cost, and what's still to pay. Each has a price; paid is false for
-- something planned or not paid yet. Versioned and soft-deleted like the other records.
CREATE TABLE expenses (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key         text UNIQUE,
    label       text NOT NULL CHECK (length(trim(label)) > 0),
    vendor      text NOT NULL DEFAULT '',
    price       numeric(10, 2) NOT NULL CHECK (price >= 0),
    paid        boolean NOT NULL DEFAULT true,
    paid_on     date,
    notes       text NOT NULL DEFAULT '',
    version     integer NOT NULL DEFAULT 1,
    deleted_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER expenses_version BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION bump_version();
