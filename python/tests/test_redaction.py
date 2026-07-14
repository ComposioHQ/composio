"""Tests for telemetry secret redaction."""

from composio.utils.redaction import redact_sensitive_text


def test_redacts_url_queries_authorization_and_secret_pairs() -> None:
    redacted = redact_sensitive_text(
        "https://example.com/file?signature=secret Bearer token123 api_key=abc password: hunter2"
    )

    assert "signature=secret" not in redacted
    assert "token123" not in redacted
    assert "api_key=abc" not in redacted
    assert "password: hunter2" not in redacted
    assert redacted.count("[REDACTED]") == 4
