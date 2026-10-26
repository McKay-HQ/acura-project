-- App pages moved from hash URLs (#part/key) to paths (/part/key): rewrite the app links in task steps to match.
-- Each changed task gets a new version, so a browser holding the old steps reloads them rather than saving over them.
UPDATE tasks
SET steps = (
    SELECT jsonb_agg(
        CASE
            WHEN step ? 'links' THEN jsonb_set(step, '{links}', (
                SELECT jsonb_agg(
                    CASE
                        WHEN link->>'href' LIKE '#%' THEN jsonb_set(link, '{href}', to_jsonb('/' || substr(link->>'href', 2)))
                        ELSE link
                    END
                    ORDER BY link_position
                )
                FROM jsonb_array_elements(step->'links') WITH ORDINALITY AS links(link, link_position)
            ))
            ELSE step
        END
        ORDER BY step_position
    )
    FROM jsonb_array_elements(steps) WITH ORDINALITY AS list(step, step_position)
)
WHERE jsonb_path_exists(steps, '$[*].links[*].href ? (@ starts with "#")');
