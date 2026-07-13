"""Tests for telemetry secret redaction."""

import queue
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from composio.core.models import _telemetry
from composio.core.models import base as base_module


class TestRedactSensitiveText:
    """Keep Python telemetry redaction aligned with the TypeScript SDK."""

    def test_returns_empty_input_unchanged(self):
        assert _telemetry.redact_sensitive_text(None) is None
        assert _telemetry.redact_sensitive_text("") == ""

    def test_redacts_url_query_strings_while_preserving_path(self):
        value = (
            "Failed to PUT https://s3.amazonaws.com/bucket/key?"
            "X-Amz-Signature=deadbeef&token=abc"
        )

        redacted = _telemetry.redact_sensitive_text(value)

        assert "https://s3.amazonaws.com/bucket/key?[REDACTED]" in redacted
        assert "deadbeef" not in redacted
        assert "token=abc" not in redacted

    @pytest.mark.parametrize(
        ("value", "secret"),
        [
            ("Authorization: Bearer sk-live-1234567890", "sk-live-1234567890"),
            ("used Basic dXNlcjpwYXNz here", "dXNlcjpwYXNz"),
            ("api_key=ck_abcdef123456", "ck_abcdef123456"),
            ('x-api-key: "ck_secretvalue"', "ck_secretvalue"),
            ("client_secret: 'topsecret'", "topsecret"),
            ("password=hunter2", "hunter2"),
            ("access_token=ya29.a0Afoobar", "ya29.a0Afoobar"),
        ],
    )
    def test_redacts_auth_credentials_and_secret_pairs(self, value, secret):
        redacted = _telemetry.redact_sensitive_text(value)

        assert "[REDACTED]" in redacted
        assert secret not in redacted

    def test_preserves_quotes_around_redacted_values(self):
        redacted = _telemetry.redact_sensitive_text('x-api-key: "ck_secretvalue"')

        assert '"[REDACTED]"' in redacted

    def test_leaves_benign_error_text_unchanged(self):
        value = "TypeError: cannot read property foo of undefined"

        assert _telemetry.redact_sensitive_text(value) == value


def test_trace_method_redacts_message_and_stack_before_push(monkeypatch):
    """Traced exceptions must be sanitized before reaching push_event."""
    captured_events = []
    monkeypatch.setattr(
        base_module,
        "push_event",
        lambda *, event: captured_events.append(event),
    )

    secret = "sk-live-trace-secret"
    presigned_secret = "signed-query-secret"
    error_message = (
        f"request failed: api_key={secret} at "
        f"https://example.com/file?token={presigned_secret}"
    )

    class DummyResource:
        _client = SimpleNamespace(provider="test")

    def fail(_self):
        raise RuntimeError(error_message)

    wrapped = base_module.trace_method(fail, "DummyResource.fail")
    token = base_module.allow_tracking.set(True)
    try:
        with pytest.raises(RuntimeError, match="request failed"):
            wrapped(DummyResource())
    finally:
        base_module.allow_tracking.reset(token)

    assert len(captured_events) == 1
    event_type, payload = captured_events[0]
    assert event_type == "error"
    error = payload["error"]
    assert "[REDACTED]" in error["message"]
    assert "[REDACTED]" in error["stack"]
    assert secret not in error["message"]
    assert secret not in error["stack"]
    assert presigned_secret not in error["message"]
    assert presigned_secret not in error["stack"]


def test_push_event_redacts_manually_constructed_error(monkeypatch):
    """The queue boundary protects error events from future producers too."""
    event_queue = queue.Queue()
    monkeypatch.setattr(
        _telemetry,
        "_setup",
        lambda: (event_queue, Mock(), Mock()),
    )
    event = _telemetry.create_event(
        type="error",
        functionName="Resource.call",
        error={
            "name": "RuntimeError",
            "message": "Authorization: Bearer queue-secret",
            "stack": "client_secret=queue-client-secret",
        },
    )

    _telemetry.push_event(event)

    queued_type, queued_payload = event_queue.get_nowait()
    queued_error = queued_payload["error"]
    assert queued_type == "error"
    assert "queue-secret" not in queued_error["message"]
    assert "queue-client-secret" not in queued_error["stack"]
    assert "[REDACTED]" in queued_error["message"]
    assert "[REDACTED]" in queued_error["stack"]
    # Redaction should not mutate an event retained by its caller.
    assert event[1]["error"]["message"] == "Authorization: Bearer queue-secret"
