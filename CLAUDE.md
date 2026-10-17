# Notes for Claude

## Commit messages

Start every commit subject with a type, which decides the release version bump (docs/ci.md#versions):

- `page:` a new page or section in the app → major
- `feat:` a change in what the app does → minor
- `fix:` a fix → patch
- `docs:`, `ci:`, `refactor:`, `style:`, `chore:`, `build:`, `test:` → patch

Add a scope when it helps: `feat(web): ...`, `fix(api): ...`, `ci(release): ...`.
