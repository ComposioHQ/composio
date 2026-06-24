from __future__ import annotations

import unittest

from email_support_agent.utils.nodes import review_pending_node


class ReviewPendingNodeTests(unittest.TestCase):
    def test_created_draft_reports_draft_created(self) -> None:
        result = review_pending_node(
            {"decision": "draft", "reasons": [], "draft_result": {"successful": True}}
        )
        self.assertEqual(result["decision"], "review_pending")
        self.assertTrue(any("Draft created" in reason for reason in result["reasons"]))

    def test_skipped_existing_draft_does_not_claim_new_draft(self) -> None:
        result = review_pending_node(
            {
                "decision": "draft",
                "reasons": [],
                "draft_result": {"skipped_existing_draft": True, "thread_id": "thread_123"},
            }
        )
        self.assertEqual(result["decision"], "review_pending")
        self.assertTrue(any("no new draft" in reason for reason in result["reasons"]))
        self.assertFalse(any("Draft created" in reason for reason in result["reasons"]))

    def test_duplicate_claim_skips(self) -> None:
        result = review_pending_node(
            {"decision": "draft", "reasons": [], "message_claim": {"acquired": False}}
        )
        self.assertEqual(result["decision"], "duplicate_skipped")


if __name__ == "__main__":
    unittest.main()
