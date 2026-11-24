"""
Reading and verifying the webhook requests Composio sends.

Shared by ``composio.triggers.parse`` / ``verify_webhook`` and
``composio.sessions.webhooks.parse``: both receive requests signed the same
way, each with its own secret.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import typing as t

from composio import exceptions


def extract_request_body(request: t.Any) -> t.Union[str, bytes, None]:
    """Read the raw body from a framework request object.

    Tries the common attributes used by Flask (``get_data``/``data``),
    Django (``body``) and similar. Returns ``None`` when nothing usable is
    found so the caller surfaces a clear parse error.
    """
    if request is None:
        return None

    # Flask: request.get_data() returns the raw body bytes.
    get_data = getattr(request, "get_data", None)
    if callable(get_data):
        return get_data()

    for attr in ("body", "data"):
        value = getattr(request, attr, None)
        if value is not None and not callable(value):
            return value

    return None


def body_to_str(body: t.Union[str, bytes, t.Mapping[str, t.Any], None]) -> str:
    """Coerce a body (str, bytes, parsed mapping, or None) into a raw string."""
    if body is None:
        return ""
    if isinstance(body, str):
        return body
    if isinstance(body, (bytes, bytearray)):
        return bytes(body).decode("utf-8")
    # Already-parsed mapping (e.g. a framework that pre-parsed JSON). Note:
    # re-serializing cannot reproduce the exact signed bytes, so signature
    # verification on a pre-parsed body is best-effort only.
    return json.dumps(body)


def get_header(headers: t.Any, name: str) -> t.Optional[str]:
    """Read a header value case-insensitively from a headers mapping.

    Supports both plain ``dict`` headers and framework header objects
    (Werkzeug/Django ``HttpHeaders``) that expose a ``get`` method, which is
    already case-insensitive.
    """
    if headers is None:
        return None

    get = getattr(headers, "get", None)
    if callable(get):
        value = get(name)
        if value is not None:
            return str(value)

    try:
        items = headers.items()
    except AttributeError:
        return None

    target = name.lower()
    for key, value in items:
        if isinstance(key, str) and key.lower() == target:
            return str(value) if value is not None else None
    return None


def verify_webhook_signature(
    *,
    webhook_id: str,
    webhook_timestamp: str,
    payload: t.Union[str, bytes],
    signature: str,
    secret: str,
) -> None:
    """
    Verify the HMAC-SHA256 signature of a webhook payload.

    The signature is computed as: HMAC-SHA256(webhookId.webhookTimestamp.payload, secret)
    and then base64 encoded with a 'v1,' prefix.

    :param webhook_id: The webhook message ID from header
    :param webhook_timestamp: The webhook timestamp from header
    :param payload: The raw webhook payload
    :param signature: The signature to verify (format: 'v1,base64EncodedSignature')
    :param secret: The webhook secret
    :raises WebhookSignatureVerificationError: If verification fails
    """
    if not payload:
        raise exceptions.WebhookSignatureVerificationError(
            "No webhook payload was provided."
        )

    if not signature:
        raise exceptions.WebhookSignatureVerificationError(
            "No signature header value was provided. "
            "Please pass the value of the webhook signature header."
        )

    if not secret:
        raise exceptions.WebhookSignatureVerificationError(
            "No webhook secret was provided. "
            "You can find your webhook secret in your Composio dashboard."
        )

    if not webhook_id:
        raise exceptions.WebhookSignatureVerificationError(
            "No webhook ID was provided. "
            "Please pass the value of the 'webhook-id' header."
        )

    if not webhook_timestamp:
        raise exceptions.WebhookSignatureVerificationError(
            "No webhook timestamp was provided. "
            "Please pass the value of the 'webhook-timestamp' header."
        )

    signature_parts = signature.split(" ")
    v1_signatures: t.List[str] = []

    for part in signature_parts:
        if part.startswith("v1,"):
            v1_signatures.append(part[3:])

    if not v1_signatures:
        raise exceptions.WebhookSignatureVerificationError(
            "No valid v1 signature found in the signature header. "
            "Expected format: 'v1,base64EncodedSignature'"
        )

    digest = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    digest.update(f"{webhook_id}.{webhook_timestamp}.".encode("utf-8"))
    digest.update(payload.encode("utf-8") if isinstance(payload, str) else payload)
    expected_signature_b64 = base64.b64encode(digest.digest()).decode("utf-8")

    for provided_sig in v1_signatures:
        try:
            if hmac.compare_digest(provided_sig, expected_signature_b64):
                return
        except Exception:
            continue

    raise exceptions.WebhookSignatureVerificationError(
        "The signature provided is invalid."
    )


def validate_webhook_timestamp(timestamp: str, tolerance: int) -> None:
    """
    Validate that the webhook timestamp header is within the allowed tolerance.

    :param timestamp: The webhook timestamp from header (Unix seconds)
    :param tolerance: Maximum allowed age in seconds
    :raises WebhookSignatureVerificationError: If timestamp is outside tolerance
    :raises WebhookPayloadError: If timestamp format is invalid
    """
    try:
        timestamp_seconds = int(timestamp)
    except (ValueError, TypeError) as e:
        raise exceptions.WebhookPayloadError(
            f"Invalid webhook timestamp: {timestamp}. "
            "Expected Unix timestamp in seconds."
        ) from e

    current_time = int(time.time())
    time_difference = abs(current_time - timestamp_seconds)

    if time_difference > tolerance:
        raise exceptions.WebhookSignatureVerificationError(
            f"The webhook timestamp is outside the allowed tolerance. "
            f"The webhook was sent {time_difference} seconds ago, "
            f"but the maximum allowed age is {tolerance} seconds."
        )
