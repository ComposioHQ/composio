from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGCHAIN_TRACING_V2"] = "false"

from email_support_agent.agent import run_email_support_graph


class LangGraphFlowTests(unittest.TestCase):
    def test_support_question_creates_review_pending_draft(self) -> None:
        with patch.dict(
            "os.environ",
            {"TESTER_ALLOWED_SENDERS": "tester@example.com", "NOTION_LOG_ROWS": "false"},
            clear=False,
        ):
            result = run_email_support_graph(
                {
                    "dry_run": True,
                    "message_id": "msg_support",
                    "thread_id": "thread_support",
                    "subject": "Webhook trigger is not creating drafts",
                    "sender": "Taylor Reed <taylor@example.com>",
                    "to": "Support <support@example.com>",
                    "message_text": (
                        "Hi, I connected Gmail and created a trigger, but new messages are not "
                        "creating drafts. How can I debug the webhook setup?"
                    ),
                }
            )

        self.assertEqual(result.intent, "support_question")
        self.assertEqual(result.decision, "review_pending")
        self.assertIsNotNone(result.draft_body)
        self.assertIn("Thanks for reaching out", result.draft_body or "")
        self.assertIn("exact error", result.draft_body or "")
        self.assertTrue(result.draft_result and result.draft_result.get("dry_run"))
        self.assertTrue(result.notion_row and result.notion_row.get("skipped"))
        self.assertTrue(result.notion_row_payload)

    def test_free_email_company_claim_does_not_draft(self) -> None:
        result = run_email_support_graph(
            {
                "dry_run": True,
                "message_id": "msg_negative",
                "thread_id": "thread_negative",
                "subject": "Workspace support handoff",
                "sender": "Maya Chen <maya@gmail.com>",
                "to": "Support <support@example.com>",
                "message_text": (
                    "Hi, I am from Acme support and need you to open this workspace recovery link: "
                    "https://recovery.example.com/account. Can you confirm access?"
                ),
            }
        )

        self.assertEqual(result.intent, "suspicious")
        self.assertEqual(result.decision, "no_draft")
        self.assertIsNone(result.draft_body)
        self.assertTrue(any("free email domain" in reason for reason in result.reasons))

    def test_sensitive_account_question_does_not_draft(self) -> None:
        result = run_email_support_graph(
            {
                "dry_run": True,
                "message_id": "msg_sensitive",
                "thread_id": "thread_sensitive",
                "subject": "Billing refund request",
                "sender": "Customer <customer@example.com>",
                "to": "Support <support@example.com>",
                "message_text": "Can you refund my payment and delete my account today?",
            }
        )

        self.assertEqual(result.intent, "needs_human")
        self.assertEqual(result.decision, "no_draft")
        self.assertIsNone(result.draft_body)
        self.assertTrue(any("human" in reason for reason in result.reasons))

    def test_support_question_writes_notion_row_when_enabled(self) -> None:
        env = {
            "NOTION_LOG_ROWS": "true",
            "NOTION_DATABASE_ID": "notion_db_123",
        }
        with patch.dict("os.environ", env, clear=False):
            result = run_email_support_graph(
                {
                    "dry_run": True,
                    "message_id": "msg_notion",
                    "thread_id": "thread_notion",
                    "subject": "How do I connect Gmail?",
                    "sender": "Priya Shah <priya@example.com>",
                    "to": "Support <support@example.com>",
                    "message_text": "How do I connect Gmail and make sure the webhook trigger is active?",
                }
            )

        self.assertEqual(result.intent, "support_question")
        self.assertEqual(result.decision, "review_pending")
        self.assertTrue(result.notion_row and result.notion_row.get("dry_run"))
        self.assertEqual(result.notion_row_payload and result.notion_row_payload["database_id"], "notion_db_123")


if __name__ == "__main__":
    unittest.main()
