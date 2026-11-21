# Organization defaults

Default community files and starter configuration templates for this organization's repositories.

This repository is public because GitHub only applies org-wide default community files from a public `.github` repository. Keep everything generic: no repository names, hostnames, people, business details, or secrets.

## Default community files

GitHub applies these to any repository in the organization that does not define its own:

- `SECURITY.md`: how to report a vulnerability.
- `.github/pull_request_template.md`: the default pull request template.

## Starter files

Copy and tailor these when setting up a repository:

| File | Destination | Purpose |
| --- | --- | --- |
| `templates/turbo.json` | `turbo.json` | Tags CI checks `"ci"` (excluding non-code Markdown and `.github/**` from code-task `inputs`). |
| `templates/vercel.json` | `vercel.json` | Builds only the production branch and configures synthetic `ci.tasks` env placeholders (`"jobs": []` must stay present when `ci` is set). |
| `templates/ruleset.json` | default branch ruleset | Requires the `CI` check from GitHub Actions (`integration_id: 15368`) with strict off and no bypass actors. |
| `templates/CODEOWNERS` | `.github/CODEOWNERS` | Optional code ownership rules. |
| `templates/dependabot.yml` | `.github/dependabot.yml` | Optional dependency update schedule. |

Note: Private repositories now run CI on Blacksmith GitHub Actions runners via the organization's private CI action rather than `actions/studio-ci` (`self-hosted, studio`).

## Legacy / retired workflows and actions

Kept temporarily only while any remaining callers migrate away; do not add new callers:

- `actions/studio-ci`, `templates/ci.yml`, `templates/ci-with-linux.yml`: legacy self-hosted runner setup.
- `.github/workflows/runners.yml`, `.github/workflows/already-tested.yml`, `actions/stop-after-failures`: retired reusable workflows/actions.

## Changing this repository

Open a pull request. The `self-test` workflow lints workflows and runs the unit tests in `tests/` on GitHub's free Ubuntu runners.
