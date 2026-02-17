"""Tests for webhook event types."""

import pytest

from composio.core.models.webhook_events import (
    ConnectionExpiredEvent,
    WebhookEventType,
    is_connection_expired_event,
)


class TestWebhookEventType:
    """Tests for WebhookEventType enum."""

    def test_connection_expired_value(self) -> None:
        """Should have correct value for CONNECTION_EXPIRED."""
        assert (
            WebhookEventType.CONNECTION_EXPIRED.value
            == "composio.connected_account.expired"
        )

    def test_trigger_message_value(self) -> None:
        """Should have correct value for TRIGGER_MESSAGE."""
        assert WebhookEventType.TRIGGER_MESSAGE.value == "composio.trigger.message"


class TestIsConnectionExpiredEvent:
    """Tests for is_connection_expired_event helper function."""

    @pytest.fixture
    def valid_payload(self) -> dict:
        """Return a valid connection expired event payload."""
        return {
            "id": "msg_847cdfcd-d219-4f18-a6dd-91acd42ca94a",
            "timestamp": "2026-02-02T10:14:20.955Z",
            "type": "composio.connected_account.expired",
            "data": {
                "toolkit": {"slug": "gmail"},
                "auth_config": {
                    "id": "ac_izZGRCZ9qyxk",
                    "auth_scheme": "OAUTH2",
                    "is_composio_managed": True,
                    "is_disabled": False,
                },
                "id": "ca__IvSeEzEBjVt",
                "user_id": "test-user",
                "status": "EXPIRED",
                "created_at": "2026-02-02T08:35:44.272Z",
                "updated_at": "2026-02-02T10:14:20.949Z",
                "state": {
                    "authScheme": "OAUTH2",
                    "val": {"status": "EXPIRED"},
                },
                "data": {},
                "params": {},
                "status_reason": None,
                "is_disabled": False,
            },
            "metadata": {
                "project_id": "pr_koucdrMIwRsf",
                "org_id": "4a4ded8f-d3ae-4dea-a229-c30234298b05",
            },
        }

    def test_returns_true_for_valid_payload(self, valid_payload: dict) -> None:
        """Should return True for a valid connection expired event."""
        assert is_connection_expired_event(valid_payload) is True

    def test_returns_false_for_trigger_message(self) -> None:
        """Should return False for a trigger message event."""
        payload = {
            "id": "msg_123",
            "timestamp": "2026-02-02T10:14:20.955Z",
            "type": "composio.trigger.message",
            "data": {},
            "metadata": {},
        }
        assert is_connection_expired_event(payload) is False

    def test_returns_false_for_none(self) -> None:
        """Should return False for None input."""
        assert is_connection_expired_event(None) is False  # type: ignore

    def test_returns_false_for_string(self) -> None:
        """Should return False for string input."""
        assert is_connection_expired_event("string") is False  # type: ignore

    def test_returns_false_for_empty_dict(self) -> None:
        """Should return False for empty dict."""
        assert is_connection_expired_event({}) is False

    def test_returns_false_for_missing_type(self, valid_payload: dict) -> None:
        """Should return False when type field is missing."""
        del valid_payload["type"]
        assert is_connection_expired_event(valid_payload) is False


class TestConnectionExpiredEventType:
    """Tests for ConnectionExpiredEvent TypedDict structure."""

    def test_type_annotation(self) -> None:
        """Should have correct type annotations."""
        # This test verifies the TypedDict can be used for type hints
        event: ConnectionExpiredEvent = {
            "id": "msg_123",
            "timestamp": "2026-02-02T10:14:20.955Z",
            "type": "composio.connected_account.expired",
            "data": {
                "toolkit": {"slug": "gmail"},
                "auth_config": {
                    "id": "ac_123",
                    "auth_scheme": "OAUTH2",
                    "is_composio_managed": True,
                    "is_disabled": False,
                },
                "id": "ca_123",
                "user_id": "user_123",
                "status": "EXPIRED",
                "created_at": "2026-02-02T08:35:44.272Z",
                "updated_at": "2026-02-02T10:14:20.949Z",
                "state": {"authScheme": "OAUTH2", "val": {}},
                "data": {},
                "params": {},
                "status_reason": None,
                "is_disabled": False,
            },
            "metadata": {"project_id": "pr_123", "org_id": "org_123"},
        }

        # Verify type narrowing works
        assert event["type"] == "composio.connected_account.expired"
        assert event["data"]["toolkit"]["slug"] == "gmail"
        assert event["metadata"]["project_id"] == "pr_123"
