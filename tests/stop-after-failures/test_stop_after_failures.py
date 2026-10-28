import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "actions", "stop-after-failures"))

from stop_after_failures import decide, failed_in_a_row  # noqa: E402

PR = {"created_at": "2026-10-27T00:00:00Z", "labels": []}


def run(run_id, conclusion, minute, status="completed"):
    return {
        "id": run_id,
        "status": status,
        "conclusion": conclusion,
        "created_at": f"2026-10-27T10:{minute:02d}:00Z",
    }


class FailedInARow(unittest.TestCase):
    def test_no_earlier_runs(self):
        self.assertEqual(failed_in_a_row([], 99), 0)

    def test_counts_back_to_the_last_pass(self):
        runs = [run(1, "failure", 1), run(2, "success", 2), run(3, "failure", 3), run(4, "failure", 4)]
        self.assertEqual(failed_in_a_row(runs, 99), 2)

    def test_order_of_the_api_response_does_not_matter(self):
        runs = [run(4, "failure", 4), run(1, "success", 1), run(3, "failure", 3)]
        self.assertEqual(failed_in_a_row(list(reversed(runs)), 99), 2)

    def test_cancelled_and_skipped_runs_neither_count_nor_reset(self):
        runs = [run(1, "failure", 1), run(2, "cancelled", 2), run(3, "skipped", 3), run(4, "failure", 4)]
        self.assertEqual(failed_in_a_row(runs, 99), 2)

    def test_timeouts_count_as_failures(self):
        self.assertEqual(failed_in_a_row([run(1, "timed_out", 1), run(2, "failure", 2)], 99), 2)

    def test_leaves_out_the_current_and_unfinished_runs(self):
        runs = [run(1, "failure", 1), run(2, None, 2, status="in_progress"), run(99, "failure", 3)]
        self.assertEqual(failed_in_a_row(runs, 99), 1)

    def test_ignores_runs_from_before_the_pull_request(self):
        old = {"id": 1, "status": "completed", "conclusion": "failure", "created_at": "2026-10-26T09:00:00Z"}
        self.assertEqual(failed_in_a_row([old, run(2, "failure", 2)], 99, PR["created_at"]), 1)


class Decide(unittest.TestCase):
    def fetch(self, runs):
        return lambda pr: runs

    def test_stops_at_the_limit(self):
        code, level, message, count = decide(
            "pull_request", {"pull_request": PR}, self.fetch([run(1, "failure", 1), run(2, "failure", 2)]), 99, 2, "ci-retry"
        )
        self.assertEqual((code, level, count), (1, "error", 2))
        self.assertIn("`ci-retry` label", message)

    def test_runs_below_the_limit(self):
        code, level, _, count = decide("pull_request", {"pull_request": PR}, self.fetch([run(1, "failure", 1)]), 99, 2, "ci-retry")
        self.assertEqual((code, level, count), (0, "info", 1))

    def test_the_label_lets_ci_run(self):
        pr = dict(PR, labels=[{"name": "ci-retry"}])
        failing = self.fetch([run(1, "failure", 1), run(2, "failure", 2)])
        self.assertEqual(decide("pull_request", {"pull_request": pr}, failing, 99, 2, "ci-retry")[0], 0)

    def test_a_failed_lookup_lets_ci_run(self):
        def broken(pr):
            raise OSError("HTTP Error 403: Forbidden")

        code, level, message, count = decide("pull_request", {"pull_request": PR}, broken, 99, 2, "ci-retry")
        self.assertEqual((code, level, count), (0, "warning", None))
        self.assertIn("403", message)

    def test_other_events_and_limit_zero_run(self):
        failing = self.fetch([run(1, "failure", 1), run(2, "failure", 2)])
        self.assertEqual(decide("schedule", {}, failing, 99, 2, "ci-retry")[0], 0)
        self.assertEqual(decide("pull_request", {"pull_request": PR}, failing, 99, 0, "ci-retry")[0], 0)


if __name__ == "__main__":
    unittest.main()
