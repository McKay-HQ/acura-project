# Notes for Claude

## Commit messages

Write commit subjects and pull request titles as a plain description of the change, with no type prefix or scope (no `feat:`, `fix(api):` and so on): the pull request's version label already says what kind of change it is. A pull request's title follows the same rule, since squashing makes it the commit.

## Version labels

The release version bump comes from pull request labels (docs/ci.md#versions). Give every pull request exactly one:

- `breaking` a breaking change, or a new page or section in the app → major
- `feature` a new feature or a change in what the app does → minor
- `fix` a fix or anything else → patch

## Branches

`main` deploys on every merge and only takes pull requests (squash or rebase). Work on a branch named `<kind>/<short-description>` (`feat/task-steps`, `fix/photo-viewer-zoom`), open a pull request (its title becomes the squashed commit), and merge it. More conventions in the README.

## Code style

ESLint, with Prettier (4 spaces, 120 columns) running inside it as a rule, from the repo root: run `npm run check` (lint and typecheck) before committing, and `npm run lint:fix` to fix. No single-letter names, one variable per declaration. On every pull request, Static Checks (`static-checks.yml`: types, ESLint with formatting) and Build Checks (`build-checks.yml`: API build, OpenAPI check, web build) run.
