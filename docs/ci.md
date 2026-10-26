# GitHub Actions

Six workflows in `.github/workflows/`. Each can be run on its own from the Actions tab (pick it, then **Run workflow**); **Deploy** runs Build and Release and starts by itself on every push to `main`; **Static Checks**, **Build Checks** and **Version label** run on every pull request, and again in the merge queue on the pull request's merge with `main` (`merge_group`), since the queue waits for every required check there too.

| Workflow                                | What it does                                                                                                                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build** (`build.yml`)                 | Builds both images and pushes them to the registry, tagged with the commit (`acura-api:<sha>`, `acura-web:<sha>`)                                                                                                                                                     |
| **Release** (`release.yml`)             | Tags a commit with the next [semantic version](https://semver.org) (bump from the merged pull requests' labels) and publishes a GitHub release with notes generated from the commits since the previous version                                                       |
| **Deploy** (`deploy.yml`)               | Build → roll out the new images and wait for the app to answer → Release                                                                                                                                                                                              |
| **Static Checks** (`static-checks.yml`) | Typechecks `api/` and `web/`, runs ESLint, which includes Prettier's formatting, and runs shellcheck on the scripts in `bin/` and `lib/`; the results go to code scanning as [SARIF](#sarif). Also runs on `main`. Job `static-checks`, which the ruleset can require |
| **Build Checks** (`build-checks.yml`)   | Builds the API, checks its `@openapi` docs against the build, and builds the web app. Job `build-checks`, which the ruleset can require                                                                                                                               |
| **Version label** (`labels.yml`)        | Fails unless the pull request has exactly one of the `breaking`, `feature` or `fix` labels. Job `version-label`, which the ruleset can require                                                                                                                        |

## What a push to main does

| What changed                                                                                                                                                                   | Jobs                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Code: `api/src/`, `api/migrations/`, `api/docker/`, `api/scripts/`, `api/*.json`, `web/`, `docker-compose.yml`, `bin/build`, `bin/deploy`, `bin/deploy.d/`, `lib/`, `.github/` | Build, roll out, Release |
| Anything else, e.g. docs or the starter data in `api/seed/`                                                                                                                    | Nothing                  |

"What changed" is counted since the last release (the last commit Deploy rolled out), not just in the push, so code that didn't go out (its rollout failed, or its run was cancelled while waiting) goes out with the next push, even one that only touches docs. With no release yet, every push deploys.

Running **Deploy** by hand builds, rolls out and releases even with no code change. Deploys never overlap: a push while one is going waits for it, and when another push arrives too, GitHub cancels the waiting run and keeps the newest (which then deploys the code of both).

A run fails (red X) if the build or rollout fails; then nothing is released.

## Setup

Once, from WSL (signed in with `az login`):

```sh
./bin/ci-setup
```

Until then the Azure jobs stop at their first step with a message naming the missing variables. See [ci-setup.md](ci-setup.md). The workflows sign in to Azure with OpenID Connect, so no password or key is stored in GitHub.

The Azure sign-in steps live in `.github/actions/azure/action.yml`, shared by Build and the rollout. Jobs run on `ubuntu-24.04` (pinned, so GitHub moving `ubuntu-latest` to a new release doesn't change anything); move it forward deliberately when there's a reason to.

## Versions

Releases use [semantic versioning](https://semver.org), starting at `v1.0.0`. Each release raises one part of the version, chosen from the labels on the pull requests merged since the previous release:

| Label      | For                                                                      | Bumps                      |
| ---------- | ------------------------------------------------------------------------ | -------------------------- |
| `breaking` | A breaking change, or a new page or section (e.g. The Car tab)           | major: `v1.4.2` → `v2.0.0` |
| `feature`  | A new feature or a change in what the app does that keeps things working | minor: `v1.4.2` → `v1.5.0` |
| `fix`      | A fix, or anything else (docs, CI, refactoring)                          | patch: `v1.4.2` → `v1.4.3` |

The biggest bump among the pull requests wins, and a pull request without a label counts as `fix`. Every pull request needs exactly one of these labels: the **Version label** workflow (`labels.yml`) fails until it has one, and runs again when labels change. Labels are read when the release runs, so a wrong label can still be fixed after merging, until the deploy reaches Release.

To override it, run **Deploy** (or **Release** on its own) from the Actions tab and pick `patch`, `minor` or `major` instead of `auto`.

## SARIF

Static Checks writes the TypeScript, ESLint and shellcheck results as [SARIF](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning) and uploads them to GitHub code scanning (categories `typescript`, `eslint` and `shellcheck`). On a pull request, problems show up as annotations on the changed lines and in the **Security → Code scanning** tab; the runs on `main` give code scanning the baseline it compares pull requests against, and close alerts once they're fixed. Formatting problems are included: Prettier runs as an ESLint rule (`prettier/prettier`, from eslint-plugin-prettier), for Markdown, YAML, JSON, CSS and HTML as well as code.

The converters are in `tools/sarif/`: an ESLint formatter (`eslint-formatter.js`), a typecheck runner (`typecheck.js`) that turns the compiler's output into SARIF, and a shellcheck runner (`shellcheck.js`) that does the same from shellcheck's JSON (it needs shellcheck, so it runs on the host or in CI, not in the Node containers). Locally, `npm run lint:sarif` writes `eslint.sarif` `npm run typecheck:sarif` writes `typecheck.sarif` and `npm run shellcheck:sarif` writes `shellcheck.sarif` (all gitignored), e.g. for the VS Code SARIF Viewer.

## The local commands still work

`./bin/deploy -b` still works, for when you want to deploy from your machine. Local builds use the `latest` tag and aren't released.
