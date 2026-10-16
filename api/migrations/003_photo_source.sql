-- Where a photo came from: the uploaded file's name (for catalog photos, "<catalog id>.jpg").
-- bin/sync uses it to tell which catalog photos a record already has.
ALTER TABLE photos ADD COLUMN source text;
