"""Tests for ``composio.sessions.webhooks.parse``."""

import base64
import copy
import hashlib
import hmac
import json
import time
import typing as t
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from composio import exceptions
from composio.core.models.session_webhooks import SessionWebhooks
from composio.core.models.tool_router import ToolRouter

SECRET = "session-webhook-secret"
FIXTURES = json.loads(
    (
        Path(__file__).with_name("fixtures") / "webhook" / "session-hook-events.json"
    ).read_text(encoding="utf-8")
)
ENVELOPE = FIXTURES["envelope"]
EVENTS = {name: {**ENVELOPE, **event} for name, event in FIXTURES["events"].items()}
WEBHOOK_ID = ENVELOPE["id"]
METADATA = ENVELOPE["metadata"]
BEFORE_TOOL_CALL = EVENTS["beforeToolCall"]
AFTER_PROXY_CALL = EVENTS["afterProxyJson"]


def now() -> str:
    return str(int(time.time()))


def sign(timestamp: str, body: t.Union[str, bytes], secret: str = SECRET) -> str:
    """Compute the signature over the original request body."""
    raw = body.encode("utf-8") if isinstance(body, str) else body
    digest = hmac.new(
        secret.encode(), f"{WEBHOOK_ID}.{timestamp}.".encode() + raw, hashlib.sha256
    ).digest()
    return f"v1,{base64.b64encode(digest).decode()}"


def signature_headers(body: t.Union[str, bytes], timestamp: str) -> t.Dict[str, str]:
    return {
        "webhook-id": WEBHOOK_ID,
        "webhook-timestamp": timestamp,
        "webhook-signature": sign(timestamp, body),
    }


def signed(
    payload: t.Any, timestamp: t.Optional[str] = None
) -> t.Tuple[str, t.Dict[str, str]]:
    body = json.dumps(payload, ensure_ascii=False)
    return body, signature_headers(body, timestamp or now())


@pytest.fixture
def webhooks() -> SessionWebhooks:
    return SessionWebhooks()


def test_reachable_at_sessions_webhooks() -> None:
    assert isinstance(ToolRouter(client=MagicMock()).webhooks, SessionWebhooks)


@pytest.mark.parametrize("payload", list(EVENTS.values()), ids=list(EVENTS))
def test_returns_a_verified_event_from_raw_bytes(
    webhooks: SessionWebhooks, payload: t.Dict[str, t.Any]
) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = signature_headers(body, now())

    hook = webhooks.parse(
        body=body,
        headers={name.title(): value for name, value in headers.items()},
        verify_secret=SECRET,
    )

    assert hook == payload


@pytest.mark.parametrize("body", ["invalid JSON", b"\xff"], ids=["json", "utf8"])
def test_rejects_a_malformed_signed_body(
    webhooks: SessionWebhooks, body: t.Union[str, bytes]
) -> None:
    with pytest.raises(
        exceptions.WebhookPayloadError,
        match="Failed to parse session webhook payload as JSON",
    ) as error:
        webhooks.parse(
            body=body, headers=signature_headers(body, now()), verify_secret=SECRET
        )

    assert error.value.__cause__ is None


def test_keeps_fields_the_sdk_does_not_know_yet(webhooks: SessionWebhooks) -> None:
    payload = copy.deepcopy(BEFORE_TOOL_CALL)
    payload["data"]["tool_call"]["added_later"] = True
    body, headers = signed(payload)

    hook = webhooks.parse(body=body, headers=headers, verify_secret=SECRET)

    assert hook == payload


def test_accepts_an_event_from_an_api_version_that_sends_no_tool_call_id(
    webhooks: SessionWebhooks,
) -> None:
    payload = copy.deepcopy(BEFORE_TOOL_CALL)
    del payload["metadata"]["tool_call_id"]
    body, headers = signed(payload)

    hook = webhooks.parse(body=body, headers=headers, verify_secret=SECRET)

    assert hook == payload


def test_accepts_a_request_when_one_of_several_signatures_matches(
    webhooks: SessionWebhooks,
) -> None:
    body, headers = signed(BEFORE_TOOL_CALL)
    older = sign(headers["webhook-timestamp"], body, secret="an-older-secret")
    headers["webhook-signature"] = f"{older} {headers['webhook-signature']}"

    hook = webhooks.parse(body=body, headers=headers, verify_secret=SECRET)

    assert hook["metadata"]["hook_id"] == "check_outgoing_email"


def test_rejects_a_request_signed_with_a_different_secret(
    webhooks: SessionWebhooks,
) -> None:
    body, headers = signed(BEFORE_TOOL_CALL)

    with pytest.raises(exceptions.WebhookSignatureVerificationError):
        webhooks.parse(body=body, headers=headers, verify_secret="some-other-secret")


def test_rejects_a_body_changed_after_signing(webhooks: SessionWebhooks) -> None:
    _, headers = signed(BEFORE_TOOL_CALL)
    tampered = json.dumps(
        {**BEFORE_TOOL_CALL, "metadata": {**METADATA, "user_id": "x"}},
        ensure_ascii=False,
    )

    with pytest.raises(exceptions.WebhookSignatureVerificationError):
        webhooks.parse(body=tampered, headers=headers, verify_secret=SECRET)


def test_rejects_an_old_request_unless_tolerance_is_zero(
    webhooks: SessionWebhooks,
) -> None:
    body, headers = signed(BEFORE_TOOL_CALL, timestamp=str(int(time.time()) - 600))

    with pytest.raises(exceptions.WebhookSignatureVerificationError):
        webhooks.parse(body=body, headers=headers, verify_secret=SECRET)

    hook = webhooks.parse(body=body, headers=headers, verify_secret=SECRET, tolerance=0)
    assert hook["id"] == WEBHOOK_ID


def test_refuses_an_empty_secret_instead_of_skipping_verification(
    webhooks: SessionWebhooks,
) -> None:
    body, headers = signed(BEFORE_TOOL_CALL)

    with pytest.raises(exceptions.ValidationError):
        webhooks.parse(body=body, headers=headers, verify_secret="")


def test_names_the_signature_headers_that_are_missing(
    webhooks: SessionWebhooks,
) -> None:
    body, _ = signed(BEFORE_TOOL_CALL)

    with pytest.raises(
        exceptions.ValidationError, match="'webhook-timestamp', 'webhook-signature'"
    ):
        webhooks.parse(
            body=body, headers={"webhook-id": WEBHOOK_ID}, verify_secret=SECRET
        )


def test_rejects_a_signed_payload_that_is_not_a_session_webhook_event(
    webhooks: SessionWebhooks,
) -> None:
    body, headers = signed(
        {
            "id": WEBHOOK_ID,
            "type": "composio.trigger.message",
            "timestamp": "2026-11-20T12:00:00.000Z",
            "metadata": {},
            "data": {},
        }
    )

    with pytest.raises(exceptions.WebhookPayloadError):
        webhooks.parse(body=body, headers=headers, verify_secret=SECRET)


def test_names_invalid_fields_without_their_values(webhooks: SessionWebhooks) -> None:
    payload = copy.deepcopy(BEFORE_TOOL_CALL)
    payload["data"]["tool_call"]["arguments"] = "a secret the agent typed"
    body, headers = signed(payload)

    with pytest.raises(exceptions.WebhookPayloadError) as error:
        webhooks.parse(body=body, headers=headers, verify_secret=SECRET)

    assert "data.tool_execute.tool_call.arguments" in str(error.value)
    assert "http_request" not in str(error.value)
    assert "a secret the agent typed" not in str(error.value)


def test_rejects_a_field_of_the_wrong_type(webhooks: SessionWebhooks) -> None:
    payload = copy.deepcopy(AFTER_PROXY_CALL)
    payload["data"]["http_response"]["status"] = "200"
    body, headers = signed(payload)

    with pytest.raises(exceptions.WebhookPayloadError, match="http_response.status"):
        webhooks.parse(body=body, headers=headers, verify_secret=SECRET)
