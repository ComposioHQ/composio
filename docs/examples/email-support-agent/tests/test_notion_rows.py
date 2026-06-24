from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

from email_support_agent.utils.notion import (
    build_notion_row_payload,
    claim_notion_message_row,
    insert_notion_row,
    insert_notion_row_payload,
    update_notion_message_row,
    upsert_notion_row_payload,
)


CLAIM_STATE = {
    "decision": "draft",
    "intent": "support_question",
    "subject": "Webhook trigger is not creating drafts",
    "message_id": "msg_claim",
    "sender": "Sam Dario <tester@example.com>",
    "thread_id": "thread_claim",
    "reasons": ["Support question fits the configured workflow."],
}


def _row(page_id: str, *, draft_link: str, created_time: str) -> dict[str, object]:
    return {
        "id": page_id,
        "url": f"https://notion.test/{page_id}",
        "created_time": created_time,
        "properties": {
            "Message ID": {"rich_text": [{"plain_text": "msg_claim"}]},
            "Draft Link": {"rich_text": [{"plain_text": draft_link}]},
        },
    }


SAMPLE_STATE = {
    "decision": "review_pending",
    "intent": "support_question",
    "subject": "Webhook trigger is not creating drafts",
    "message_id": "msg_123",
    "sender": "Sam Dario <tester@example.com>",
    "thread_id": "thread_123",
    "reasons": ["Support question fits the configured workflow."],
    "draft_result": {"dry_run": True, "thread_id": "thread_123"},
}


class NotionRowTests(unittest.TestCase):
    def test_notion_logging_is_disabled_by_default(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            result = insert_notion_row(SAMPLE_STATE, user_id="test_user", dry_run=True)

        self.assertTrue(result["skipped"])
        self.assertIn("NOTION_LOG_ROWS", result["reason"])

    def test_builds_dry_run_payload_for_email_database(self) -> None:
        env = {
            "NOTION_LOG_ROWS": "true",
            "NOTION_DATABASE_ID": "notion_db_123",
        }
        with patch.dict("os.environ", env, clear=True):
            result = insert_notion_row(SAMPLE_STATE, user_id="test_user", dry_run=True)
            payload = build_notion_row_payload(SAMPLE_STATE)

        self.assertTrue(result["dry_run"])
        self.assertEqual(result["payload"]["database_id"], "notion_db_123")
        self.assertEqual(payload["database_id"], "notion_db_123")
        properties = {item["name"]: item for item in payload["properties"]}
        self.assertEqual(properties["Company"]["type"], "title")
        self.assertEqual(properties["Priority"]["value"], "High")
        self.assertEqual(properties["From"]["value"], "tester@example.com")
        self.assertIn("Dry-run draft", properties["Draft Link"]["value"])
        self.assertNotIn("_", properties["Draft Link"]["value"])
        self.assertIn("Support question", properties["Why?"]["value"])
        self.assertEqual(properties["Message ID"]["value"], "msg_123")

    def test_uses_gmail_draft_url_when_create_draft_returns_display_url(self) -> None:
        state = {
            **SAMPLE_STATE,
            "draft_result": {
                "data": {
                    "display_url": "https://mail.google.com/mail/u/0/#drafts/r-123",
                    "message": {
                        "display_url": "https://mail.google.com/mail/u/0/#drafts/r-123",
                        "threadId": "thread_123",
                    },
                },
                "successful": True,
            },
        }
        with patch.dict("os.environ", {"NOTION_DATABASE_ID": "notion_db_123"}, clear=True):
            payload = build_notion_row_payload(state)

        properties = {item["name"]: item for item in payload["properties"]}
        self.assertEqual(
            properties["Draft Link"]["value"],
            "https://mail.google.com/mail/u/0/#drafts/r-123",
        )

    def test_priority_is_not_high_for_all_no_draft_rows(self) -> None:
        suspicious = {
            **SAMPLE_STATE,
            "decision": "no_draft",
            "intent": "suspicious",
            "draft_result": None,
        }
        unsupported = {
            **SAMPLE_STATE,
            "decision": "no_draft",
            "intent": "unsupported_question",
            "draft_result": None,
        }

        with patch.dict("os.environ", {"NOTION_DATABASE_ID": "notion_db_123"}, clear=True):
            suspicious_payload = build_notion_row_payload(suspicious)
            unsupported_payload = build_notion_row_payload(unsupported)

        suspicious_props = {item["name"]: item for item in suspicious_payload["properties"]}
        unsupported_props = {item["name"]: item for item in unsupported_payload["properties"]}
        self.assertEqual(suspicious_props["Priority"]["value"], "Medium")
        self.assertEqual(unsupported_props["Priority"]["value"], "Low")
        self.assertEqual(suspicious_props["Draft Link"]["value"], "No draft")
        self.assertEqual(unsupported_props["Draft Link"]["value"], "No draft")

    @patch("email_support_agent.utils.notion.time.sleep", return_value=None)
    @patch("email_support_agent.utils.tools.Composio")
    def test_archives_duplicate_rows_after_insert(self, composio_cls: MagicMock, _sleep: MagicMock) -> None:
        with patch.dict("os.environ", {"NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            payload = build_notion_row_payload(SAMPLE_STATE)
        query_tool = MagicMock()
        insert_tool = MagicMock()
        archive_tool = MagicMock()
        query_tool.invoke.side_effect = [
            {"results": []},
            {
                "results": [
                    {
                        "id": "page_keep",
                        "url": "https://notion.test/keep",
                        "created_time": "2026-06-23T00:00:00Z",
                        "properties": {"Message ID": {"rich_text": [{"plain_text": "msg_123"}]}},
                    },
                    {
                        "id": "page_archive",
                        "url": "https://notion.test/archive",
                        "created_time": "2026-06-23T00:00:01Z",
                        "properties": {"Message ID": {"rich_text": [{"plain_text": "msg_123"}]}},
                    },
                ]
            },
        ]
        insert_tool.invoke.return_value = {"successful": True, "data": {"id": "page_keep"}}
        query_tool.name = "NOTION_QUERY_DATABASE"
        insert_tool.name = "NOTION_INSERT_ROW_DATABASE"
        archive_tool.name = "NOTION_ARCHIVE_NOTION_PAGE"
        session = MagicMock()
        session.tools.return_value = [query_tool, insert_tool, archive_tool]
        composio_cls.return_value.create.return_value = session

        with patch.dict("os.environ", {"NOTION_LOG_ROWS": "true", "NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            result = insert_notion_row_payload(payload, user_id="test_user")

        self.assertTrue(result["successful"])
        self.assertEqual(result["dedupe"]["duplicates_found"], 1)
        archive_tool.invoke.assert_called_once_with({"page_id": "page_archive", "archive": True})

    @patch("email_support_agent.utils.notion.time.sleep", return_value=None)
    @patch("email_support_agent.utils.tools.Composio")
    def test_upserts_existing_message_row(self, composio_cls: MagicMock, _sleep: MagicMock) -> None:
        with patch.dict("os.environ", {"NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            payload = build_notion_row_payload(SAMPLE_STATE)
        query_tool = MagicMock()
        update_tool = MagicMock()
        query_tool.invoke.side_effect = [
            {
                "results": [
                    {
                        "id": "existing_page",
                        "url": "https://notion.test/existing",
                        "created_time": "2026-06-23T00:00:00Z",
                        "properties": {"Message ID": {"rich_text": [{"plain_text": "msg_123"}]}},
                    }
                ]
            },
            {
                "results": [
                    {
                        "id": "existing_page",
                        "properties": {
                            "Company": {"title": [{"plain_text": "Webhook trigger is not creating drafts"}]},
                            "Date": {"date": {"start": payload["properties"][0]["value"]}},
                            "Draft Link": {"rich_text": [{"plain_text": "Dry-run draft for thread thread-123"}]},
                            "From": {"rich_text": [{"plain_text": "tester@example.com"}]},
                            "Message ID": {"rich_text": [{"plain_text": "msg_123"}]},
                            "Priority": {"select": {"name": "High"}},
                            "Why?": {"rich_text": [{"plain_text": "Support question fits the configured workflow."}]},
                        },
                    }
                ]
            },
        ]
        update_tool.invoke.return_value = {"successful": True}
        query_tool.name = "NOTION_QUERY_DATABASE"
        update_tool.name = "NOTION_UPDATE_PAGE"
        session = MagicMock()
        session.tools.return_value = [query_tool, update_tool]
        composio_cls.return_value.create.return_value = session

        with patch.dict("os.environ", {"NOTION_LOG_ROWS": "true", "NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            result = upsert_notion_row_payload(payload, user_id="test_user")

        self.assertTrue(result["successful"])
        self.assertEqual(result["upsert"]["operation"], "update")
        self.assertEqual(result["upsert"]["page_id"], "existing_page")
        update_tool.invoke.assert_called_once()

    @patch("email_support_agent.utils.notion.time.sleep", return_value=None)
    @patch("email_support_agent.utils.tools.Composio")
    def test_replaces_claim_row_when_update_does_not_persist(self, composio_cls: MagicMock, _sleep: MagicMock) -> None:
        final_state = {
            **SAMPLE_STATE,
            "draft_result": {
                "data": {"display_url": "https://mail.google.com/mail/u/0/#drafts/r-123"},
                "successful": True,
            },
        }
        payload = build_notion_row_payload(final_state)
        update_tool = MagicMock()
        query_tool = MagicMock()
        archive_tool = MagicMock()
        insert_tool = MagicMock()

        update_tool.invoke.return_value = {"successful": True}
        query_tool.invoke.side_effect = [
            {
                "results": [
                    {
                        "id": "claim_page",
                        "properties": {
                            "Company": {"title": [{"plain_text": "Webhook trigger is not creating drafts"}]},
                            "Date": {"date": {"start": "2026-06-23"}},
                            "Draft Link": {"rich_text": [{"plain_text": "Pending draft creation"}]},
                            "From": {"rich_text": [{"plain_text": "tester@example.com"}]},
                            "Message ID": {"rich_text": [{"plain_text": "msg_123"}]},
                            "Priority": {"select": {"name": "Low"}},
                            "Why?": {"rich_text": [{"plain_text": "Support question fits the configured workflow."}]},
                        },
                    }
                ]
            },
            {
                "results": [
                    {
                        "id": "final_page",
                        "url": "https://notion.test/final",
                        "created_time": "2026-06-23T00:00:02Z",
                        "properties": {"Message ID": {"rich_text": [{"plain_text": "msg_123"}]}},
                    }
                ]
            },
        ]
        insert_tool.invoke.return_value = {"successful": True, "data": {"id": "final_page"}}
        update_tool.name = "NOTION_UPDATE_PAGE"
        query_tool.name = "NOTION_QUERY_DATABASE"
        archive_tool.name = "NOTION_ARCHIVE_NOTION_PAGE"
        insert_tool.name = "NOTION_INSERT_ROW_DATABASE"
        session = MagicMock()
        session.tools.return_value = [update_tool, query_tool, archive_tool, insert_tool]
        composio_cls.return_value.create.return_value = session

        with patch.dict("os.environ", {"NOTION_LOG_ROWS": "true", "NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            result = update_notion_message_row(payload, page_id="claim_page", user_id="test_user")

        self.assertTrue(result["successful"])
        self.assertEqual(result["reason"], "NOTION_UPDATE_PAGE did not persist the expected properties.")
        archive_tool.invoke.assert_called_once_with({"page_id": "claim_page", "archive": True})
        insert_tool.invoke.assert_called_once_with(payload)
        self.assertEqual(result["fallback_reinsert"]["archived_claim_row"], "claim_page")


class ClaimNotionMessageRowTests(unittest.TestCase):
    def _session(self, composio_cls: MagicMock, tools: list[MagicMock]) -> None:
        session = MagicMock()
        session.tools.return_value = tools
        composio_cls.return_value.create.return_value = session

    @patch("email_support_agent.utils.notion.time.sleep", return_value=None)
    @patch("email_support_agent.utils.tools.Composio")
    def test_claim_fails_open_when_insert_returns_no_page_id(self, composio_cls: MagicMock, _sleep: MagicMock) -> None:
        query_tool, insert_tool = MagicMock(), MagicMock()
        query_tool.invoke.return_value = {"results": []}
        insert_tool.invoke.return_value = {"successful": False}
        query_tool.name = "NOTION_QUERY_DATABASE"
        insert_tool.name = "NOTION_INSERT_ROW_DATABASE"
        self._session(composio_cls, [query_tool, insert_tool])

        with patch.dict("os.environ", {"NOTION_LOG_ROWS": "true", "NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            result = claim_notion_message_row(CLAIM_STATE, user_id="test_user")

        self.assertTrue(result["acquired"])
        self.assertTrue(result["claim_failed"])

    @patch("email_support_agent.utils.notion.time.sleep", return_value=None)
    @patch("email_support_agent.utils.tools.Composio")
    def test_claim_trusts_own_insert_when_not_yet_queryable(self, composio_cls: MagicMock, _sleep: MagicMock) -> None:
        query_tool, insert_tool, archive_tool = MagicMock(), MagicMock(), MagicMock()
        # Insert never becomes queryable across all retry attempts.
        query_tool.invoke.return_value = {"results": []}
        insert_tool.invoke.return_value = {"successful": True, "data": {"id": "page_new"}}
        query_tool.name = "NOTION_QUERY_DATABASE"
        insert_tool.name = "NOTION_INSERT_ROW_DATABASE"
        archive_tool.name = "NOTION_ARCHIVE_NOTION_PAGE"
        self._session(composio_cls, [query_tool, insert_tool, archive_tool])

        with patch.dict("os.environ", {"NOTION_LOG_ROWS": "true", "NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            result = claim_notion_message_row(CLAIM_STATE, user_id="test_user")

        self.assertTrue(result["acquired"])
        self.assertTrue(result["claim_unverified"])
        archive_tool.invoke.assert_not_called()

    @patch("email_support_agent.utils.notion.time.sleep", return_value=None)
    @patch("email_support_agent.utils.tools.Composio")
    def test_claim_defers_when_competitor_visible_and_insert_unverified(self, composio_cls: MagicMock, _sleep: MagicMock) -> None:
        query_tool, insert_tool, archive_tool = MagicMock(), MagicMock(), MagicMock()
        competitor = _row(
            "page_competitor",
            draft_link="https://mail.google.com/draft",
            created_time="2026-06-23T00:00:00Z",
        )
        # Pre-insert check is empty; post-insert queries surface a competing
        # claim row while our own page id is never queryable.
        query_tool.invoke.side_effect = [{"results": []}] + [{"results": [competitor]}] * 5
        insert_tool.invoke.return_value = {"successful": True, "data": {"id": "page_new"}}
        query_tool.name = "NOTION_QUERY_DATABASE"
        insert_tool.name = "NOTION_INSERT_ROW_DATABASE"
        archive_tool.name = "NOTION_ARCHIVE_NOTION_PAGE"
        self._session(composio_cls, [query_tool, insert_tool, archive_tool])

        with patch.dict("os.environ", {"NOTION_LOG_ROWS": "true", "NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            result = claim_notion_message_row(CLAIM_STATE, user_id="test_user")

        self.assertFalse(result["acquired"])
        self.assertTrue(result["duplicate"])
        archive_tool.invoke.assert_called_once()

    @patch("email_support_agent.utils.notion.time.sleep", return_value=None)
    @patch("email_support_agent.utils.tools.Composio")
    def test_completed_row_blocks_as_duplicate(self, composio_cls: MagicMock, _sleep: MagicMock) -> None:
        query_tool, insert_tool = MagicMock(), MagicMock()
        query_tool.invoke.return_value = {
            "results": [_row("page_done", draft_link="https://mail.google.com/draft", created_time="2026-06-23T00:00:00Z")]
        }
        query_tool.name = "NOTION_QUERY_DATABASE"
        insert_tool.name = "NOTION_INSERT_ROW_DATABASE"
        self._session(composio_cls, [query_tool, insert_tool])

        with patch.dict("os.environ", {"NOTION_LOG_ROWS": "true", "NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            result = claim_notion_message_row(CLAIM_STATE, user_id="test_user")

        self.assertFalse(result["acquired"])
        self.assertTrue(result["duplicate"])
        insert_tool.invoke.assert_not_called()

    @patch("email_support_agent.utils.notion.time.sleep", return_value=None)
    @patch("email_support_agent.utils.tools.Composio")
    def test_stale_pending_row_is_reclaimed(self, composio_cls: MagicMock, _sleep: MagicMock) -> None:
        stale_time = (datetime.now(UTC) - timedelta(seconds=4000)).isoformat()
        fresh_time = datetime.now(UTC).isoformat()
        query_tool, insert_tool, archive_tool = MagicMock(), MagicMock(), MagicMock()
        query_tool.invoke.side_effect = [
            {"results": [_row("page_stale", draft_link="Pending draft creation", created_time=stale_time)]},
            {"results": [_row("page_new", draft_link="Pending draft creation", created_time=fresh_time)]},
            {"results": [_row("page_new", draft_link="Pending draft creation", created_time=fresh_time)]},
        ]
        insert_tool.invoke.return_value = {"successful": True, "data": {"id": "page_new"}}
        query_tool.name = "NOTION_QUERY_DATABASE"
        insert_tool.name = "NOTION_INSERT_ROW_DATABASE"
        archive_tool.name = "NOTION_ARCHIVE_NOTION_PAGE"
        self._session(composio_cls, [query_tool, insert_tool, archive_tool])

        with patch.dict("os.environ", {"NOTION_LOG_ROWS": "true", "NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            result = claim_notion_message_row(CLAIM_STATE, user_id="test_user")

        self.assertTrue(result["acquired"])
        insert_tool.invoke.assert_called_once()
        archive_tool.invoke.assert_any_call({"page_id": "page_stale", "archive": True})

    @patch("email_support_agent.utils.tools.Composio")
    def test_claim_without_message_id_disables_protection(self, composio_cls: MagicMock) -> None:
        state = {key: value for key, value in CLAIM_STATE.items() if key != "message_id"}
        with patch.dict("os.environ", {"NOTION_LOG_ROWS": "true", "NOTION_DATABASE_ID": "notion_db_123"}, clear=False):
            result = claim_notion_message_row(state, user_id="test_user")

        self.assertTrue(result["acquired"])
        self.assertFalse(result["duplicate_protection"])
        composio_cls.return_value.create.assert_not_called()


if __name__ == "__main__":
    unittest.main()
