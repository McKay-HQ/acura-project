# Notes for Claude

## Commit messages

Start every commit subject with a type: `feat:`, `fix:`, `docs:`, `ci:`, `refactor:`, `style:`, `chore:`, `build:`, `test:`. Add a scope when it helps: `feat(web): ...`, `fix(api): ...`, `ci(release): ...`. A pull request's title follows the same pattern, since squashing makes it the commit.

## Version labels

The release version bump comes from pull request labels, not commit types (docs/ci.md#versions). Give every pull request exactly one:

- `breaking` a breaking change, or a new page or section in the app → major
- `feature` a new feature or a change in what the app does → minor
- `fix` a fix or anything else → patch
- `sync` a catalog sync from the app (bin/sync opens these) → no bump

## Branches

`main` deploys on every merge and only takes pull requests (squash or rebase). Work on a branch named `<kind>/<short-description>` (`feat/task-steps`, `fix/photo-viewer-zoom`), open a pull request whose title has a type too (it becomes the squashed commit), and merge it. More conventions in the README.

## Code style

ESLint, with Prettier (4 spaces, 120 columns) running inside it as a rule, from the repo root: run `npm run check` (lint and typecheck) before committing, and `npm run lint:fix` to fix. No single-letter names, one variable per declaration. On every pull request, Static Checks (`static-checks.yml`: types, ESLint with formatting) and Build Checks (`build-checks.yml`: API build, OpenAPI check, web build) run.
