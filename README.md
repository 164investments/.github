# Organization defaults

Default community files and CI starter files for this organization's repositories.

This repository is public, because GitHub only applies default community files from a public `.github` repository. Keep it generic: no repository names, hostnames, people, business details or secrets.

## CI runs on the self-hosted runners

Private repositories run their checks on the organization's self-hosted runners (label `studio`, runner group restricted to private repositories), natively: no containers. Each repository keeps its checks as Turborepo tasks tagged `"ci"` and its install command and placeholder env in `vercel.json`'s `ci` block, and `templates/ci.yml` runs them through `actions/studio-ci`, the way Vercel CI did. Scheduled jobs are Vercel Cron Jobs, with a Vercel Sandbox when a job needs one, and deploys are Vercel's own build of the production branch. Public repositories keep GitHub's free runners and never use the self-hosted ones.

Set up a repository with these starter files:

| File | Where it goes | What it does |
| --- | --- | --- |
| `templates/turbo.json` | `turbo.json` | Tags each check `"ci"`, which is what CI runs. Each tagged task is a `package.json` script. Code tasks leave Markdown and `.github/**` out of their inputs, so a docs-only change runs only the format check. Keep the tasks the repository has and delete the rest. |
| `templates/vercel.json` | `vercel.json` | Builds only `main`, and adds the `ci` block: `bootstrapping.installCommand` (default: the lockfile's install) and `ci.tasks` env. Keep `"jobs": []`: Vercel's deployment API rejects a `ci` block without it, and the production deploy fails. `ci.tasks` gives a task synthetic placeholder values; only `constant` values, never a real secret. |
| `templates/ci.yml` | `.github/workflows/ci.yml` | Runs every task tagged `"ci"` on the self-hosted runners and reports one check, `CI`. |
| `templates/ruleset.json` | the default branch's ruleset | Requires the `CI` check from GitHub Actions (15368), with no up-to-date rule and no bypass actors. |

The steps:

1. Link the repository to a Vercel project for deploys. A repository that deploys nothing sets `"git": {"deploymentEnabled": false}` instead.
2. Add Turborepo with the repository's package manager, set `packageManager` in `package.json`, and add `.turbo` to `.gitignore`.
3. Copy `templates/turbo.json`, `templates/vercel.json` and `templates/ci.yml`, and keep only what the repository needs.
4. Open a pull request. Once `CI` passes, add the ruleset: `gh api -X POST repos/<owner>/<repo>/rulesets --input templates/ruleset.json` (use the default branch's name if it isn't `main`).
5. Keep Vercel CI off for the repository: `PATCH /v1/vercel-ci/repository-settings?provider=github&organizationId=<owner>&repository=<repo>` with `{"ciEnabled": false}`.

A task that runs `docker run <postgres image>` (a `postgres` task next to the tests) gets a native PostgreSQL server instead: `actions/studio-ci/bin/docker` stands in for `docker run`, `exec`, `rm`, `stop` and `kill` for PostgreSQL only, serves the image's major version from the runner's PostgreSQL, and makes jobs that want the same host port take turns. Any other Docker use fails and says so.

`node actions/studio-ci/run.mjs --plan`, run from a repository's root, prints its install command and task groups without running them.

Type-check once, in CI: a Next.js app sets `typescript: { ignoreBuildErrors: true }` in `next.config`, and no `build` script chains a type check.

## Retired workflows

These reusable workflows and the step below are retired. Each stays only until its last caller is gone; then it is deleted. Don't add a new caller.

| File | What it did |
| --- | --- |
| `.github/workflows/runners.yml` | Failed a pull request whose workflows ran off a Blacksmith runner, pushed CI on every branch, or let a superseded run go on. |
| `.github/workflows/already-tested.yml` | Let a push to `main` skip the checks its pull request already passed. |
| `actions/stop-after-failures` | Stopped a pull request's CI after its last 2 runs failed, until a person added `ci-retry`. |

`node-check.yml`, `python-check.yml`, `gitleaks.yml` and `supabase-migrations.yml` were deleted on 2026-10-29, when no repository called them. Their checks now run as Turborepo tasks in each repository.

## Default community files

GitHub uses these for any repository in the organization that has no file of its own:

- `SECURITY.md`: how to report a vulnerability.
- `.github/pull_request_template.md`: the pull request template.

## Other starter files

GitHub doesn't apply these by default, so copy them into a repository and edit them:

- `templates/CODEOWNERS` goes to `.github/CODEOWNERS`.
- `templates/dependabot.yml` goes to `.github/dependabot.yml`.

## Changing this repository

Open a pull request. The `self-test` workflow lints the workflow files and calls the retired workflows and the step against `tests/`. It runs on GitHub's free runners, because this repository is public.
