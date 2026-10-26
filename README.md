# Organization defaults

Shared CI workflows and default community files for this organization's repositories.

This repository is public, because GitHub only applies default community files from a public `.github` repository. Keep it generic: no repository names, hostnames, people, business details or secrets.

## Reusable workflows

Call them from a repository's own workflow. Pin to `@main`, or to a commit SHA for a fixed version.

| Workflow | What it does |
| --- | --- |
| `node-check.yml` | Runs `npm ci`, then `npm run check` when that script exists. Otherwise it runs each of `lint`, `typecheck`, `test` and `build` that exists. It fails when none exists. |
| `python-check.yml` | Installs the project, then runs Ruff, mypy when configured, and pytest or unittest. A `check-command` input replaces the automatic steps. |
| `gitleaks.yml` | Scans for committed secrets with the gitleaks CLI. Pull requests scan their own commits, pushes scan the pushed commits, and other events scan the whole history. Findings are redacted in the log. |
| `supabase-migrations.yml` | Replays every `.sql` file in the migrations folder, in file-name order, into a throwaway Postgres 17 service container. The default image is Supabase's Postgres image, so the `auth` and `storage` schemas and the standard roles exist. |
| `runners.yml` | Fails when a job in the caller's `.github/workflows` runs off a Blacksmith runner. A job that cannot run on Blacksmith keeps its runner with `# github-runner: <reason>` on the same line. It also fails a push trigger on every branch or on a branch pattern such as `feat/**`, and a pull-request workflow without a `concurrency` group that cancels the older run. |
| `already-tested.yml` | For a push: answers `tested: 'true'` when the pushed tree already passed the calling workflow on the pull request it merged, so the caller's other jobs can skip a second run of the same checks. A failed lookup, a merge that changed the tree, or any other event answers false, so the checks run. |

Each workflow's job is named `check`, `gitleaks`, `supabase-migrations`, `runners` or `already-tested`, so a caller job named `check` shows up as `check / check`.

Every workflow runs on a Blacksmith runner (`blacksmith-2vcpu-ubuntu-2404`) unless the caller passes a `runner` input. A public repository can pass `runner: ubuntu-latest`, which GitHub runs free. Jobs a repository writes itself use the same Blacksmith labels, and `runners.yml` checks them.

### Example

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  check:
    uses: 164investments/.github/.github/workflows/node-check.yml@main
    with:
      node-version: "24"

  secrets:
    uses: 164investments/.github/.github/workflows/gitleaks.yml@main

  migrations:
    uses: 164investments/.github/.github/workflows/supabase-migrations.yml@main
    with:
      migrations-path: supabase/migrations

  runners:
    uses: 164investments/.github/.github/workflows/runners.yml@main
```

To skip a push's second run of checks its pull request already passed, call `already-tested.yml` on push only and gate the other jobs on it:

```yaml
  tested:
    if: github.event_name == 'push'
    permissions:
      actions: read
      contents: read
      pull-requests: read
    uses: 164investments/.github/.github/workflows/already-tested.yml@main

  check:
    needs: tested
    if: ${{ !cancelled() && needs.tested.outputs.tested != 'true' }}
    uses: 164investments/.github/.github/workflows/node-check.yml@main
```

The inputs of each workflow are listed and described at the top of its file.

## Default community files

GitHub uses these for any repository in the organization that has no file of its own:

- `SECURITY.md`: how to report a vulnerability.
- `.github/pull_request_template.md`: the pull request template.

## Starter files

GitHub doesn't apply these by default, so copy them into a repository and edit them:

- `templates/CODEOWNERS` goes to `.github/CODEOWNERS`.
- `templates/dependabot.yml` goes to `.github/dependabot.yml`.

## Changing this repository

Open a pull request. The `self-test` workflow calls every reusable workflow against the small projects in `tests/fixtures/`, and it must pass before merge.
