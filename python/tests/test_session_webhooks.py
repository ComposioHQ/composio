"""Tests for ``composio.sessions.webhooks.parse``."""

import base64
import copy
import hashlib
import hmac
import json
import time
import typing as t
from unittest.mock import MagicMock

import pytest

from composio import exceptions
from composio.core.models.session_webhooks import SessionWebhooks
from composio.core.models.tool_router import ToolRouter

SECRET = "session-webhook-secret"
WEBHOOK_ID = "msg_3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90"

METADATA = {
    "project_id": "pr_123",
    "session_id": "trs_123",
    "user_id": "user_123",
    "hook_id": "check_outgoing_email",
}

TOOL_CALL = {
    "toolkit_slug": "gmail",
    "tool_slug": "GMAIL_SEND_EMAIL",
    "toolkit_version": "20261101_00",
    "connected_account_id": "ca_123",
    "arguments": {"recipient_email": "jane@customer.com"},
}

BEFORE_TOOL_CALL: t.Dict[str, t.Any] = {
    "id": WEBHOOK_ID,
    "type": "composio.session_hook.before_execute",
    "timestamp": "2026-11-20T12:00:00.000Z",
    "metadata": METADATA,
    "data": {"type": "tool_execute", "tool_call": TOOL_CALL},
}

AFTER_PROXY_CALL: t.Dict[str, t.Any] = {
    "id": WEBHOOK_ID,
    "type": "composio.session_hook.after_execute",
    "timestamp": "2026-11-20T12:00:00.000Z",
    "metadata": METADATA,
    "data": {
        "type": "proxy_execute",
        "http_request": {
            "toolkit_slug": "github",
            "method": "GET",
            "endpoint": "/user/repos",
            "parameters": [{"name": "per_page", "value": "10", "type": "query"}],
        },
        "http_response": {
            "status": 200,
            "headers": {"content-type": "application/json"},
            "data": [{"name": "composio"}],
        },
    },
}


def now() -> str:
    return str(int(time.time()))


def sign(timestamp: str, body: str, secret: str = SECRET) -> str:
    """The signature Composio sends: v1,<base64 HMAC-SHA256(secret, id.timestamp.body)>."""
    digest = hmac.new(
        secret.encode(), f"{WEBHOOK_ID}.{timestamp}.{body}".encode(), hashlib.sha256
    ).digest()
    return f"v1,{base64.b64encode(digest).decode()}"


def signed(
    payload: t.Any, timestamp: t.Optional[str] = None
) -> t.Tuple[str, t.Dict[str, str]]:
    timestamp = timestamp or now()
    body = json.dumps(payload)
    return body, {
        "webhook-id": WEBHOOK_ID,
        "webhook-timestamp": timestamp,
        "webhook-signature": sign(timestamp, body),
    }


@pytest.fixture
def webhooks() -> SessionWebhooks:
    return SessionWebhooks()


def test_reachable_at_sessions_webhooks() -> None:
    assert isinstance(ToolRouter(client=MagicMock()).webhooks, SessionWebhooks)


def test_returns_a_verified_before_execute_tool_call_as_sent(
    webhooks: SessionWebhooks,
) -> None:
    body, headers = signed(BEFORE_TOOL_CALL)

    hook = webhooks.parse(body=body, headers=headers, verify_secret=SECRET)

    assert hook == BEFORE_TOOL_CALL


def test_returns_a_verified_after_execute_proxy_call_from_a_request_object(
    webhooks: SessionWebhooks,
) -> None:
    body, headers = signed(AFTER_PROXY_CALL)
    request = MagicMock(spec=["get_data", "headers"])
    request.get_data.return_value = body.encode()
    request.headers = {name.title(): value for name, value in headers.items()}

    hook = webhooks.parse(request, verify_secret=SECRET)

    assert hook == AFTER_PROXY_CALL


def test_keeps_fields_the_sdk_does_not_know_yet(webhooks: SessionWebhooks) -> None:
    payload = copy.deepcopy(BEFORE_TOOL_CALL)
    payload["data"]["tool_call"]["added_later"] = True
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
        {**BEFORE_TOOL_CALL, "metadata": {**METADATA, "user_id": "x"}}
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

    assert "arguments" in str(error.value)
    assert "a secret the agent typed" not in str(error.value)
