from __future__ import annotations

import unittest
from unittest.mock import patch

from email_support_agent.utils.gmail import (
    _select_message,
    create_gmail_review_draft,
    messages_from_fetch_result,
)
from email_support_agent.utils.tools import DRAFT_TOOL


class SelectMessageTests(unittest.TestCase):
    def test_matches_camelcase_message_id(self) -> None:
        messages = [{"messageId": "msg_123", "subject": "Hello"}]
        self.assertEqual(_select_message(messages, message_id="msg_123")["subject"], "Hello")

    def test_matches_thread_id_when_message_id_absent_from_results(self) -> None:
        messages = [
            {"id": "other", "threadId": "thread_x"},
            {"id": "want", "threadId": "thread_123"},
        ]
        selected = _select_message(messages, message_id="missing", thread_id="thread_123")
        self.assertEqual(selected["id"], "want")

    def test_returns_none_when_identifier_given_but_unmatched(self) -> None:
        messages = [{"id": "unrelated", "subject": "Other thread"}]
        self.assertIsNone(_select_message(messages, message_id="msg_123", thread_id="thread_123"))

    def test_subject_fallback_only_without_identifiers(self) -> None:
        messages = [{"id": "a", "subject": "Other"}, {"id": "b", "subject": "Target"}]
        self.assertEqual(_select_message(messages, message_id=None, subject="Target")["id"], "b")


class GmailResultTests(unittest.TestCase):
    def test_messages_from_data_wrapped_fetch_result(self) -> None:
        result = {
            "successful": True,
            "data": {
                "messages": [
                    {
                        "messageId": "msg_123",
                        "subject": "Wrapped result",
                    }
                ]
            },
        }

        self.assertEqual(messages_from_fetch_result(result), result["data"]["messages"])

    def test_review_draft_replies_in_existing_thread(self) -> None:
        calls: list[dict[str, object]] = []

        def fake_invoke(_tool: object, args: dict[str, object]) -> dict[str, object]:
            calls.append(args)
            return {"successful": True, "data": {"id": "draft_123"}}

        state = {
            "user_id": "email_support_user",
            "fetched_email": {
                "message_id": "msg_123",
                "thread_id": "thread_123",
                "subject": "Webhook trigger is not creating drafts",
                "sender": "Taylor Reed <tester@example.com>",
                "message_text": "How can I debug webhook events that arrive without visible drafts?",
            },
        }

        with (
            patch.dict("os.environ", {"EMAIL_SUPPORT_DISABLE_LLM_DRAFTS": "true"}, clear=False),
            patch("email_support_agent.utils.gmail.gmail_tool_map", return_value={DRAFT_TOOL: object()}),
            patch("email_support_agent.utils.gmail.invoke_tool", side_effect=fake_invoke),
        ):
            result = create_gmail_review_draft(state)

        self.assertEqual(result["draft_result"], {"successful": True, "data": {"id": "draft_123"}})
        self.assertEqual(calls[0]["thread_id"], "thread_123")
        self.assertEqual(calls[0]["subject"], "")

    def test_review_draft_uses_reply_subject_without_thread_id(self) -> None:
        calls: list[dict[str, object]] = []

        def fake_invoke(_tool: object, args: dict[str, object]) -> dict[str, object]:
            calls.append(args)
            return {"successful": True, "data": {"id": "draft_123"}}

        state = {
            "user_id": "email_support_user",
            "fetched_email": {
                "message_id": "msg_123",
                "subject": "Webhook trigger is not creating drafts",
                "sender": "Taylor Reed <tester@example.com>",
                "message_text": "How can I debug webhook events that arrive without visible drafts?",
            },
        }

        with (
            patch.dict("os.environ", {"EMAIL_SUPPORT_DISABLE_LLM_DRAFTS": "true"}, clear=False),
            patch("email_support_agent.utils.gmail.gmail_tool_map", return_value={DRAFT_TOOL: object()}),
            patch("email_support_agent.utils.gmail.invoke_tool", side_effect=fake_invoke),
        ):
            result = create_gmail_review_draft(state)

        self.assertEqual(result["draft_result"], {"successful": True, "data": {"id": "draft_123"}})
        self.assertNotIn("thread_id", calls[0])
        self.assertEqual(calls[0]["subject"], "Re: Webhook trigger is not creating drafts")


if __name__ == "__main__":
    unittest.main()
