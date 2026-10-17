# Notes for Claude

## Commit messages

Start every commit subject with a type, which decides the release version bump (docs/ci.md#versions):

- `page:` a new page or section in the app → major
- `feat:` a change in what the app does → minor
- `fix:` a fix → patch
- `docs:`, `ci:`, `refactor:`, `style:`, `chore:`, `build:`, `test:` → patch

Add a scope when it helps: `feat(web): ...`, `fix(api): ...`, `ci(release): ...`.

## Branches

`main` deploys on every merge and only takes pull requests (squash or rebase). Work on a branch named `<type>/<short-description>` (`feat/task-steps`, `fix/photo-viewer-zoom`), open a pull request whose title has a type too (it becomes the squashed commit), and merge it. More conventions in the README.

## Code style

Prettier (4 spaces, 120 columns) and ESLint, both from the repo root: run `npm run check` before committing, and `npm run lint:fix` / `npm run format` to fix. No single-letter names, one variable per declaration. The Check workflow (`.github/workflows/check.yml`) runs the same on every pull request.
