"""Stop a pull request's CI after its last runs failed several times in a row.

Each push to a ready pull request runs every check again. When a change keeps
failing, pushing fix after fix makes CI the test loop, and each try pays for
the whole suite. This step fails the run before the checks start once the
workflow's last LIMIT finished runs on the pull request failed, so the next
try happens on the author's machine.
"""

import json
import os
import sys
import urllib.parse
import urllib.request

# Conclusions that say the change failed. Cancelled, skipped, neutral and the
# rest say nothing about the change, so they neither count nor reset the count.
FAILED = {"failure", "timed_out", "startup_failure"}


def failed_in_a_row(runs, current_run_id, since=None):
    """Count the latest finished runs that failed, back to the last pass.

    `runs` are workflow runs from GitHub's API in any order. The current run,
    unfinished runs and runs created before `since` (the pull request's
    creation time, so an earlier pull request on the same branch is ignored)
    are left out.
    """
    count = 0
    for run in sorted(runs, key=lambda r: r["created_at"], reverse=True):
        if run["id"] == current_run_id or run.get("status") != "completed":
            continue
        if since and run["created_at"] < since:
            break
        conclusion = run.get("conclusion")
        if conclusion == "success":
            break
        if conclusion in FAILED:
            count += 1
    return count


def stop_message(count, label):
    return (
        f"This pull request's last {count} CI runs failed, so CI stopped here instead of "
        "running every check again. Reproduce the failure on your machine and fix it there: "
        "run the failing tests and the fast checks until they pass. Then stop and tell a person "
        "what failed and what you changed. Don't push again to see whether CI passes. "
        f"A person who agrees adds the `{label}` label to this pull request, which lets CI run "
        "again. If the failure is in a test this change didn't touch, the default branch is "
        "broken: find the merge that broke it instead."
    )


def decide(event_name, event, fetch_runs, run_id, limit, label):
    """Return (exit code, level, message, failed count or None)."""
    if event_name not in ("pull_request", "pull_request_target"):
        return 0, "info", "Not a pull request, so CI runs.", None
    if limit <= 0:
        return 0, "info", "The limit is 0, so this step is off.", None
    pr = event.get("pull_request") or {}
    labels = {item.get("name") for item in pr.get("labels") or []}
    if label in labels:
        return 0, "info", f"The `{label}` label is on this pull request, so CI runs.", None
    try:
        runs = fetch_runs(pr)
    except Exception as error:  # noqa: BLE001 - any lookup failure lets CI run
        return 0, "warning", f"Could not read this pull request's earlier runs ({error}), so CI runs.", None
    count = failed_in_a_row(runs, run_id, pr.get("created_at"))
    if count >= limit:
        return 1, "error", stop_message(count, label), count
    return 0, "info", f"{count} failed run(s) in a row before this one (CI stops at {limit}), so CI runs.", count


def github_fetcher(env):
    """Read the calling workflow's pull-request runs on the pull request's branch."""

    def fetch(pr):
        repo = env["GITHUB_REPOSITORY"]
        # owner/repo/.github/workflows/ci.yml@refs/pull/1/merge
        workflow = env["GITHUB_WORKFLOW_REF"].split("@", 1)[0].rsplit("/", 1)[-1]
        api = env.get("GITHUB_API_URL", "https://api.github.com")
        branch = env.get("GITHUB_HEAD_REF") or (pr.get("head") or {}).get("ref")
        if not branch:
            raise ValueError("no head branch")
        query = urllib.parse.urlencode({"event": "pull_request", "branch": branch, "per_page": 30})
        url = f"{api}/repos/{repo}/actions/workflows/{urllib.parse.quote(workflow)}/runs?{query}"
        request = urllib.request.Request(url, headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {env['TOKEN']}",
            "X-GitHub-Api-Version": "2022-11-28",
        })
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)["workflow_runs"]

    return fetch


def main():
    env = os.environ
    event = {}
    if env.get("GITHUB_EVENT_PATH"):
        with open(env["GITHUB_EVENT_PATH"], encoding="utf-8") as handle:
            event = json.load(handle)
    try:
        limit = int(env.get("LIMIT") or "2")
    except ValueError:
        limit = 2
    code, level, message, count = decide(
        env.get("GITHUB_EVENT_NAME", ""),
        event,
        github_fetcher(env),
        int(env.get("GITHUB_RUN_ID") or 0),
        limit,
        env.get("LABEL") or "ci-retry",
    )
    if level == "error":
        print(f"::error title=CI stopped after {count} failed runs::{message}")
    elif level == "warning":
        print(f"::warning::{message}")
    else:
        print(message)
    if env.get("GITHUB_STEP_SUMMARY"):
        with open(env["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write(message + "\n")
    if env.get("GITHUB_OUTPUT"):
        with open(env["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"failed={'' if count is None else count}\n")
    return code


if __name__ == "__main__":
    sys.exit(main())
