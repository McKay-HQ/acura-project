-- Step-by-step instructions on tasks: [{text, done, links?: [{label, href}], photos?: ["engine:03"]}].
-- A task with steps is done when every step is done; the API keeps tasks.done in step with them.
ALTER TABLE tasks ADD COLUMN steps jsonb NOT NULL DEFAULT '[]'::jsonb;
