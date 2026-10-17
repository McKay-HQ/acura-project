# GitHub Actions

Six workflows in `.github/workflows/`. Each can be run on its own from the Actions tab (pick it, then **Run workflow**); **Deploy** runs Build, Sync and Release and starts by itself on every push to `main`; **Static Checks** and **Build Checks** run on every pull request.

| Workflow                                | What it does                                                                                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build** (`build.yml`)                 | Builds both images and pushes them to the registry, tagged with the commit (`acura-api:<sha>`, `acura-web:<sha>`)                                                                                        |
| **Sync** (`sync.yml`)                   | Two-way sync of the catalog with the app (`bin/sync`); what it pulls from the app goes into `main` through a pull request that merges itself                                                             |
| **Release** (`release.yml`)             | Tags a commit with the next [semantic version](https://semver.org) and publishes a GitHub release with notes generated from the commits since the previous version                                       |
| **Deploy** (`deploy.yml`)               | Build → roll out the new images and wait for the app to answer → Sync → Release                                                                                                                          |
| **Static Checks** (`static-checks.yml`) | Typechecks `api/` and `web/` and runs ESLint and Prettier; TypeScript and ESLint results go to code scanning as [SARIF](#sarif). Also runs on `main`. Job `static-checks`, which the ruleset can require |
| **Build Checks** (`build-checks.yml`)   | Builds the API, checks its `@openapi` docs against the build, and builds the web app. Job `build-checks`, which the ruleset can require                                                                  |

## What a push to main does

| What changed                                                                                                                                                                   | Jobs                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Code: `api/src/`, `api/migrations/`, `api/docker/`, `api/scripts/`, `api/*.json`, `web/`, `docker-compose.yml`, `bin/build`, `bin/deploy`, `bin/deploy.d/`, `lib/`, `.github/` | Build, roll out, Sync, Release |
| Anything else, e.g. the catalog in `api/seed/`                                                                                                                                 | Sync only                      |

Running **Deploy** by hand builds, rolls out and releases even with no code change (untick the box to only sync). Deploys never overlap: a push while one is going waits for it.

A run fails (red X) if the build or rollout fails, or if the sync finds a **conflict** (the same field changed in both the catalog and the app). The release still happens after a sync conflict, since the code was deployed. Settle the conflict locally with `./bin/sync -c` (catalog wins) or `./bin/sync -a` (app wins), see [sync.md](sync.md). Merges the workflows make themselves (the sync's pull requests) don't start a deploy.

The sync's pull requests come from the workflow's own token, which GitHub doesn't let start other workflows, so the sync starts the Check workflow on them itself. For this, Settings > Actions > General > "Allow GitHub Actions to create and approve pull requests" must be on.

## Setup

Once, from WSL (signed in with `az login`):

```sh
./bin/ci-setup
```

Until then the Azure jobs stop at their first step with a message naming the missing variables. See [ci-setup.md](ci-setup.md). The workflows sign in to Azure with OpenID Connect, so no password or key is stored in GitHub.

The Azure sign-in steps live in `.github/actions/azure/action.yml`, shared by Build, Sync and the rollout. Jobs run on `ubuntu-24.04` (pinned, so GitHub moving `ubuntu-latest` to a new release doesn't change anything); move it forward deliberately when there's a reason to.

## Versions

Releases use [semantic versioning](https://semver.org), starting at `v1.0.0`. Each release raises one part of the version, chosen from the commit messages since the previous release. A commit message starts with its type, optionally a scope, then a colon:

| Type                                                                 | For                                                        | Bumps                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------- |
| `page:`                                                              | A new page or section (e.g. The Car tab)                   | major: `v1.4.2` → `v2.0.0` |
| `feat:`                                                              | A change in what the app does (new controls, new behavior) | minor: `v1.4.2` → `v1.5.0` |
| `fix:`                                                               | A fix                                                      | patch: `v1.4.2` → `v1.4.3` |
| anything else (`docs:`, `ci:`, `refactor:`, `style:`, `chore:`, ...) | Changes that aren't features or fixes                      | patch                      |

The biggest bump among the commits wins. A scope goes in parentheses: `feat(web): photo captions`, `fix(api): reject empty step text`.

To override it, run **Deploy** (or **Release** on its own) from the Actions tab and pick `patch`, `minor` or `major` instead of `auto`.

## SARIF

Static Checks writes the TypeScript and ESLint results as [SARIF](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning) and uploads them to GitHub code scanning (categories `typescript` and `eslint`). On a pull request, problems show up as annotations on the changed lines and in the **Security → Code scanning** tab; the runs on `main` give code scanning the baseline it compares pull requests against, and close alerts once they're fixed. Prettier has no SARIF output, so formatting problems are only in the job log.

The converters are in `tools/sarif/`: an ESLint formatter (`eslint-formatter.js`) and a typecheck runner (`typecheck.js`) that turns the compiler's output into SARIF. Locally, `npm run lint:sarif` writes `eslint.sarif` and `npm run typecheck:sarif` writes `typecheck.sarif` (both gitignored), e.g. for the VS Code SARIF Viewer.

## The local commands still work

`./bin/deploy -b` and `./bin/sync` are unchanged, for when you want to deploy from your machine. Local builds use the `latest` tag and aren't released.
