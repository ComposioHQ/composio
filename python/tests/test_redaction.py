"""Tests for telemetry secret redaction."""

import json
from typing import NamedTuple

import pytest

from composio.utils.redaction import redact_sensitive_text, redact_sensitive_value


class _RequestContext(NamedTuple):
    request_id: str
    api_key: str


class _RenderedContext:
    def __repr__(self) -> str:
        return "RenderedContext(api_key='object_test_secret')"


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
        ('{"auth":"app-key:pusher-secret"}', "app-key:pusher-secret"),
        ('{"COMPOSIO_API_KEY":"prefixed-double-secret"}', "prefixed-double-secret"),
        ("{'OPENAI_API_KEY': 'prefixed single secret'}", "prefixed single secret"),
        ('{"x-api-key":"sk-hdr","user":"bob"}', "sk-hdr"),
        ("{'client_secret': 'cs-live-abc123'}", "cs-live-abc123"),
        ('{"password": "hunter2"}', "hunter2"),
        (
            '{"password": "correct horse battery staple"}',
            "correct horse battery staple",
        ),
        ("{'client_secret': 'multi word secret'}", "multi word secret"),
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


def test_redacts_secret_without_consuming_the_adjacent_field() -> None:
    assert (
        redact_sensitive_text('{"api_key":"secret","user":"bob"}')
        == '{"api_key":"[REDACTED]","user":"bob"}'
    )


def test_redacts_escaped_quoted_secret_in_serialized_message() -> None:
    source = json.dumps({"error": 'password: "secret"'})
    expected = json.dumps({"error": 'password: "[REDACTED]"'})

    assert redact_sensitive_text(source) == expected
    assert redact_sensitive_text("password: \\'secret\\'") == (
        "password: \\'[REDACTED]\\'"
    )

    double_encoded = json.dumps({"body": json.dumps({"api_key": "secret"})})
    double_encoded_expected = json.dumps(
        {"body": json.dumps({"api_key": "[REDACTED]"})}
    )
    assert redact_sensitive_text(double_encoded) == double_encoded_expected


def test_preserves_serialized_adjacent_keys_with_escapes() -> None:
    source = json.dumps(
        {"error": "unknown field auth:", 'quoted"key': "safe", "path\\key": "safe"}
    )

    assert redact_sensitive_text(source) == source


def test_redacts_unquoted_secrets_containing_backslashes() -> None:
    assert redact_sensitive_text("password=abc\\def") == "password=[REDACTED]"
    assert redact_sensitive_text("password=\\leading") == "password=[REDACTED]"


def test_redacts_many_quoted_secrets_in_one_pass() -> None:
    source = " ".join(f'password: "secret-{index}"' for index in range(1_000))
    expected = " ".join('password: "[REDACTED]"' for _ in range(1_000))

    assert redact_sensitive_text(source) == expected


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


@pytest.mark.parametrize(
    "text",
    [
        '{"error": "unknown field auth:", "user": "bob"}',
        "{'note': 'unknown field auth:', \"user\": 'bob'}",
        '{"error": "unknown field auth:", "$schema": "safe"}',
        '{"error": "unknown field auth:", "@type": "safe"}',
        '{"error": "unknown field auth:", "üser": "safe"}',
        '{"error": "unknown field auth:", ".well-known": "safe"}',
        '{"error": "unknown field auth:", ":type": "safe"}',
        '{"error": "unknown field auth:", "?field": "safe"}',
    ],
)
def test_does_not_consume_adjacent_fields_after_key_like_text(text: str) -> None:
    assert redact_sensitive_text(text) == text


@pytest.mark.parametrize(
    ("text", "secret"),
    [
        ('password: "punctuated secret";', "punctuated secret"),
        ("client_secret='period secret'.", "period secret"),
        ('api_key = "prose secret" followed by context', "prose secret"),
        ('password: "escaped \\"secret\\" value"', 'escaped \\"secret\\" value'),
        ('can\'t connect password: "secret"', "secret"),
        ('users\' password: "secret"', "secret"),
        ('Chris\' password: "secret"', "secret"),
        ('Andrés\' password: "secret"', "secret"),
        ('{"error":"request failed password: \'secret\'"}', "secret"),
        ('5" from target password: "secret"', "secret"),
        ('unmatched " before password: "secret"', "secret"),
        ("unmatched ' before password: 'secret'", "secret"),
        ('password: "}abc"', "}abc"),
        ('api_key: ",abc"', ",abc"),
    ],
)
def test_redacts_bare_quoted_values_before_punctuation_or_prose(
    text: str, secret: str
) -> None:
    redacted = redact_sensitive_text(text)

    assert secret not in redacted
    assert "[REDACTED]" in redacted


def test_structured_redaction_bounds_recursive_metadata() -> None:
    cyclic: dict[str, object] = {}
    cyclic["self"] = cyclic

    deeply_nested: object = "safe"
    for _ in range(40):
        deeply_nested = {"next": deeply_nested}

    assert redact_sensitive_value(cyclic) == {"self": "[REDACTED]"}
    assert "[REDACTED]" in str(redact_sensitive_value(deeply_nested))


def test_structured_redaction_handles_sequences_and_rendered_objects() -> None:
    context = _RequestContext("request-1", "namedtuple_test_secret")
    redacted = redact_sensitive_value(
        {
            "items": [{"access_token": "list_test_secret"}],
            "tuple": ("Authorization: Bearer bearer_value_secret",),
            "context": context,
            "rendered": _RenderedContext(),
            "binary": b"api_key=binary_test_secret",
        }
    )

    assert isinstance(redacted["context"], _RequestContext)
    assert redacted["context"].request_id == "request-1"
    rendered = str(redacted)
    for secret in (
        "list_test_secret",
        "bearer_value_secret",
        "namedtuple_test_secret",
        "object_test_secret",
        "binary_test_secret",
    ):
        assert secret not in rendered


def test_structured_redaction_stops_at_the_node_budget() -> None:
    assert redact_sensitive_value(list(range(10_001))) == "[REDACTED]"
    wide_mapping = redact_sensitive_value(
        {f"field_{index}": index for index in range(10_001)}
    )
    assert isinstance(wide_mapping, dict)
    assert len(wide_mapping) < 10_001
