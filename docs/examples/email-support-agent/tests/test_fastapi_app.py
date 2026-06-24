from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGCHAIN_TRACING_V2"] = "false"

from email_support_agent.app import app


def _sample_gmail_trigger_payload() -> dict[str, object]:
    return {
        "id": "msg_test_fastapi",
        "timestamp": "2026-06-23T00:00:00.000Z",
        "type": "composio.trigger.message",
        "metadata": {
            "trigger_slug": "GMAIL_NEW_GMAIL_MESSAGE",
            "trigger_id": "ti_test_fastapi",
            "connected_account_id": "ca_test_fastapi",
            "user_id": "email_support_user",
        },
        "data": {
            "id": "gmail_msg_fastapi",
            "message_id": "gmail_msg_fastapi",
            "thread_id": "gmail_thread_fastapi",
            "subject": "Webhook trigger is not creating drafts",
            "sender": "Taylor Reed <tester@example.com>",
            "to": "support@example.com",
            "message_text": (
                "Hi, I connected Gmail and created a trigger, but new messages are not\n"
                "creating drafts. How can I debug the webhook setup?"
            ),
        },
    }


class FastApiWebhookTests(unittest.TestCase):
    def test_health(self) -> None:
        client = TestClient(app)
        response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})

    def test_webhook_rejects_unsigned_request_by_default(self) -> None:
        client = TestClient(app)
        env = {
            "ALLOW_UNVERIFIED_WEBHOOKS": "",
            "COMPOSIO_WEBHOOK_SECRET": "",
        }
        with patch.dict(os.environ, env, clear=False):
            response = client.post("/webhook/composio", json=_sample_gmail_trigger_payload())

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "invalid_webhook")

    def test_webhook_runs_langgraph_dry_run_without_gmail_side_effects(self) -> None:
        client = TestClient(app)
        with tempfile.TemporaryDirectory() as tmpdir:
            events_path = str(Path(tmpdir) / "events.jsonl")
            env = {
                "ALLOW_UNVERIFIED_WEBHOOKS": "true",
                "LANGGRAPH_DRY_RUN": "true",
                "WEBHOOK_EVENTS_PATH": events_path,
            }
            with patch.dict(os.environ, env, clear=False):
                response = client.post(
                    "/webhook/composio",
                    content=json.dumps(_sample_gmail_trigger_payload()).encode("utf-8"),
                    headers={"content-type": "application/json"},
                )

            body = response.json()
            self.assertEqual(response.status_code, 200)
            self.assertFalse(body["verified"])
            self.assertEqual(body["action"]["action"], "enqueue_langgraph_email_support")
            self.assertEqual(body["graph_result"]["decision"], "review_pending")
            self.assertEqual(body["graph_result"]["draft_result"]["dry_run"], True)
            self.assertIn("Thanks for reaching out", body["graph_result"]["draft_body"])
            self.assertNotIn("GMAIL_SEND_EMAIL", json.dumps(body))

            event_lines = Path(events_path).read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(event_lines), 1)

    def test_webhook_ignores_gmail_draft_trigger_payloads(self) -> None:
        client = TestClient(app)
        payload = _sample_gmail_trigger_payload()
        data = dict(payload["data"])  # type: ignore[arg-type]
        data["id"] = "gmail_draft_message"
        data["message_id"] = "gmail_draft_message"
        data["label_ids"] = ["DRAFT"]
        payload["data"] = data

        with tempfile.TemporaryDirectory() as tmpdir:
            events_path = str(Path(tmpdir) / "events.jsonl")
            env = {
                "ALLOW_UNVERIFIED_WEBHOOKS": "true",
                "LANGGRAPH_DRY_RUN": "false",
                "WEBHOOK_EVENTS_PATH": events_path,
            }
            with patch.dict(os.environ, env, clear=False):
                response = client.post(
                    "/webhook/composio",
                    content=json.dumps(payload).encode("utf-8"),
                    headers={"content-type": "application/json"},
                )

        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["action"]["action"], "ignore_gmail_draft_message")
        self.assertIsNone(body["graph_result"])

if __name__ == "__main__":
    unittest.main()
