# Organization defaults

Default community files and CI starter files for this organization's repositories.

This repository is public, because GitHub only applies default community files from a public `.github` repository. Keep it generic: no repository names, hostnames, people, business details or secrets.

## CI runs on Vercel

Private repositories run their checks on [Vercel CI](https://vercel.com/docs/ci) and keep no GitHub Actions workflows. Scheduled jobs are Vercel Cron Jobs, with a Vercel Sandbox when a job needs one, and deploys are Vercel's own build of the production branch. Public repositories can't use Vercel CI and keep GitHub's free runners.

Set up a repository with these starter files:

| File | Where it goes | What it does |
| --- | --- | --- |
| `templates/turbo.json` | `turbo.json` | Tags each check `"ci"`, which is what Vercel CI runs. Each tagged task is a `package.json` script. Code tasks leave Markdown and `.github/**` out of their inputs, so a docs-only change runs only the format check. Keep the tasks the repository has and delete the rest. |
| `templates/vercel.json` | `vercel.json` | Builds only `main`, and adds the `ci` block. Keep `"jobs": []`: Vercel's deployment API rejects a `ci` block without it, and the production deploy fails. `ci.tasks` gives a task synthetic placeholder values; never a real secret. |
| `templates/ruleset.json` | the default branch's ruleset | Requires the `Vercel CI` status from Vercel's GitHub app (8329), with no up-to-date rule and no bypass actors. |

The steps:

1. Link the repository to a Vercel project. A repository that deploys nothing sets `"git": {"deploymentEnabled": false}` instead.
2. Add Turborepo with the repository's package manager, set `packageManager` in `package.json`, and add `.turbo` to `.gitignore`.
3. Copy `templates/turbo.json` and `templates/vercel.json`, and keep only what the repository needs.
4. Turn Vercel CI on: `vercel ci enable --remote origin --scope <team>`. Then push once; every push to any branch starts a run.
5. Once `Vercel CI` passes, add the ruleset: `gh api -X POST repos/<owner>/<repo>/rulesets --input templates/ruleset.json` (use the default branch's name if it isn't `main`).

Type-check once, in CI: a Next.js app sets `typescript: { ignoreBuildErrors: true }` in `next.config`, and no `build` script chains a type check.

## Retired workflows

These reusable workflows and the step below are retired. Each stays only until its last caller moves to Vercel; then it is deleted. Don't add a new caller.

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
