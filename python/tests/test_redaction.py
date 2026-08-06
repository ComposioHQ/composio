"""Tests for telemetry secret redaction."""

import pytest

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


@pytest.mark.parametrize(
    ("text", "secret"),
    [
        ('{"api_key": "sk-live-abc123"}', "sk-live-abc123"),
        ('{"api_key":"sk-live-abc123"}', "sk-live-abc123"),
        ('{"api_key" : "sk-live-abc123"}', "sk-live-abc123"),
        ('{"refresh_token":"rt-abc.def-123"}', "rt-abc.def-123"),
        ('{"x-api-key":"sk-hdr","user":"bob"}', "sk-hdr"),
        ("{'client_secret': 'cs-live-abc123'}", "cs-live-abc123"),
        ('{"password": "hunter2"}', "hunter2"),
    ],
)
def test_redacts_secrets_in_json_and_dict_reprs(text: str, secret: str) -> None:
    """Serialized payloads are the common shape in exception text.

    The key's own closing quote sits between the name and the colon, so a
    pattern anchored on ``name`` followed directly by ``:`` never matches.
    """
    redacted = redact_sensitive_text(text)

    assert secret not in redacted
    assert "[REDACTED]" in redacted


def test_redacts_secret_in_serialized_error_payload() -> None:
    """The shape that reaches the telemetry error field via a tool failure."""
    text = (
        "Error executing tool: request body was rejected: "
        '{"toolkit": "GMAIL", "arguments": {"api_key": "sk-live-CUSTOMER", "to": "x@y.z"}}'
    )

    redacted = redact_sensitive_text(text)

    assert "sk-live-CUSTOMER" not in redacted
    assert "GMAIL" in redacted  # non-secret context is preserved


def test_json_keys_are_preserved() -> None:
    """Only the value is replaced; the key and quoting survive intact."""
    assert (
        redact_sensitive_text('{"api_key": "sk-live-abc123"}')
        == '{"api_key": "[REDACTED]"}'
    )


@pytest.mark.parametrize(
    "text",
    [
        "the password field is required",
        "TypeError: cannot read property secret of undefined",
        'no separator here "api_key" and nothing else',
    ],
)
def test_leaves_benign_text_untouched(text: str) -> None:
    """A key name with no value attached must not trigger redaction."""
    assert redact_sensitive_text(text) == text


@pytest.mark.parametrize(
    ("text", "secret"),
    [
        ("COMPOSIO_API_KEY=sk_live_9f3c", "sk_live_9f3c"),
        ("OPENAI_API_KEY=sk_live_9f3c", "sk_live_9f3c"),
        ('export COMPOSIO_API_KEY="sk_live_9f3c"', "sk_live_9f3c"),
    ],
)
def test_redacts_env_style_prefixed_api_keys(text: str, secret: str) -> None:
    """Underscore before api_key is a word char, so a leading \\b would miss these."""
    redacted = redact_sensitive_text(text)

    assert secret not in redacted
    assert "[REDACTED]" in redacted


def test_does_not_match_secret_name_embedded_in_letters() -> None:
    """Lookbehind still refuses letter-prefixed collisions like myapikey=x."""
    assert redact_sensitive_text("myapikey=sk_live_9f3c") == "myapikey=sk_live_9f3c"
