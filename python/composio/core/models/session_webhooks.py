"""
Session webhooks: the events Composio sends to a project's session webhook URL.

A session hook with a ``webhook`` handler sends each call it applies to, before
or after it runs, to the project's session webhook URL and waits for the
endpoint's answer. ``composio.sessions.webhooks.parse`` verifies and returns
that event, and the ``SessionWebhook*Response`` types describe the answers.

The event and the answers keep the field names of the webhook reference: the
endpoint reads the event and writes its answer as plain JSON.
"""

from __future__ import annotations

import json
import typing as t
from enum import Enum

import pydantic
import typing_extensions as te

from composio import exceptions
from composio.utils.webhook_verification import (
    body_to_str,
    extract_request_body,
    get_header,
    validate_webhook_timestamp,
    verify_webhook_signature,
)


class SessionWebhookEventType(str, Enum):
    """The events Composio sends to a session webhook URL."""

    BEFORE_EXECUTE = "composio.session_hook.before_execute"
    AFTER_EXECUTE = "composio.session_hook.after_execute"


# =============================================================================
# EVENTS: what Composio sends
# =============================================================================


class SessionWebhookMetadata(te.TypedDict):
    """Where the event came from. ``hook_id`` is the hook's id on the session."""

    project_id: str
    session_id: str
    user_id: str
    hook_id: str


class SessionWebhookToolCall(te.TypedDict):
    """A tool call. ``connected_account_id`` is omitted when the call doesn't
    use a connected account."""

    toolkit_slug: str
    tool_slug: str
    toolkit_version: str
    connected_account_id: te.NotRequired[str]
    arguments: t.Dict[str, t.Any]


class SessionWebhookToolResponse(te.TypedDict):
    """What a tool returned. ``error`` is ``None`` unless the tool failed."""

    data: t.Dict[str, t.Any]
    error: t.Optional[str]


SessionWebhookHttpMethod = t.Literal["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]


class SessionWebhookHttpParameter(te.TypedDict):
    """A header or query parameter of a proxy call."""

    name: str
    value: str
    type: t.Literal["header", "query"]


class SessionWebhookHttpRequest(te.TypedDict):
    """A proxy call: an HTTP request to a toolkit's API.

    ``endpoint`` is as the agent gave it: a path relative to the toolkit's API
    base URL, or a full URL. ``parameters`` are the headers and query
    parameters the agent added; the credentials Composio adds are not
    included. ``body`` is omitted when there is none or when it is binary.
    """

    toolkit_slug: str
    connected_account_id: te.NotRequired[str]
    method: SessionWebhookHttpMethod
    endpoint: str
    parameters: t.List[SessionWebhookHttpParameter]
    body: te.NotRequired[t.Any]


class SessionWebhookBinaryData(te.TypedDict):
    """A file a proxy call returned, as a temporary download link."""

    url: str
    content_type: str
    size: int
    expires_at: te.NotRequired[str]


class SessionWebhookHttpResponse(te.TypedDict):
    """What a proxy call returned. ``data`` is omitted when the response is a
    file, which is then in ``binary_data``."""

    status: int
    headers: t.Dict[str, str]
    data: te.NotRequired[t.Any]
    binary_data: te.NotRequired[SessionWebhookBinaryData]


class SessionWebhookToolCallBeforeExecuteData(te.TypedDict):
    type: t.Literal["tool_execute"]
    tool_call: SessionWebhookToolCall


class SessionWebhookProxyCallBeforeExecuteData(te.TypedDict):
    type: t.Literal["proxy_execute"]
    http_request: SessionWebhookHttpRequest


class SessionWebhookToolCallAfterExecuteData(te.TypedDict):
    type: t.Literal["tool_execute"]
    tool_call: SessionWebhookToolCall
    tool_response: SessionWebhookToolResponse


class SessionWebhookProxyCallAfterExecuteData(te.TypedDict):
    type: t.Literal["proxy_execute"]
    http_request: SessionWebhookHttpRequest
    http_response: SessionWebhookHttpResponse


class SessionWebhookBeforeExecuteEvent(te.TypedDict):
    """Sent before a call runs. ``data["type"]`` says whether it is a tool
    call (``tool_call``) or a proxy call (``http_request``)."""

    id: str
    type: t.Literal["composio.session_hook.before_execute"]
    timestamp: str
    metadata: SessionWebhookMetadata
    data: t.Union[
        SessionWebhookToolCallBeforeExecuteData,
        SessionWebhookProxyCallBeforeExecuteData,
    ]


class SessionWebhookAfterExecuteEvent(te.TypedDict):
    """Sent after a call ran, with what it returned: ``tool_response`` for a
    tool call, ``http_response`` for a proxy call."""

    id: str
    type: t.Literal["composio.session_hook.after_execute"]
    timestamp: str
    metadata: SessionWebhookMetadata
    data: t.Union[
        SessionWebhookToolCallAfterExecuteData,
        SessionWebhookProxyCallAfterExecuteData,
    ]


SessionWebhookEvent = t.Union[
    SessionWebhookBeforeExecuteEvent, SessionWebhookAfterExecuteEvent
]
"""An event Composio sends to the session webhook URL, as returned by
``composio.sessions.webhooks.parse``."""


# =============================================================================
# ANSWERS: what the endpoint sends back, with HTTP status 200
#
# Composio rejects an answer with a field it doesn't know, except on a block,
# and then applies the hook's ``fallback_action``.
# =============================================================================


class SessionWebhookBlockResponse(te.TypedDict):
    """Stops the call. ``message`` is shown to the agent."""

    action: t.Literal["block"]
    message: str


class SessionWebhookToolCallOverride(te.TypedDict):
    """Arguments to call the tool with, in place of the original ones."""

    arguments: t.Dict[str, t.Any]


class SessionWebhookHttpRequestOverride(te.TypedDict, total=False):
    """Fields of a proxy request to replace. Fields left out keep their
    original value. The toolkit cannot be changed."""

    method: SessionWebhookHttpMethod
    endpoint: str
    parameters: t.List[SessionWebhookHttpParameter]
    body: t.Any


class SessionWebhookToolResponseOverride(te.TypedDict):
    """Data to give the agent, in place of the tool's data."""

    data: t.Dict[str, t.Any]


class SessionWebhookHttpResponseOverride(te.TypedDict, total=False):
    """Fields of a proxy response to replace. Fields left out keep their
    original value; ``headers`` replaces the API's headers in full. The status
    and a binary file cannot be changed."""

    data: t.Any
    headers: t.Dict[str, str]


class SessionWebhookToolCallChange(te.TypedDict):
    tool_call: SessionWebhookToolCallOverride


class SessionWebhookHttpRequestChange(te.TypedDict):
    http_request: SessionWebhookHttpRequestOverride


class SessionWebhookToolResponseChange(te.TypedDict):
    tool_response: SessionWebhookToolResponseOverride


class SessionWebhookHttpResponseChange(te.TypedDict):
    http_response: SessionWebhookHttpResponseOverride


class SessionWebhookBeforeExecuteContinueResponse(te.TypedDict):
    """Lets the call run. ``override`` runs it with changes: ``tool_call`` for
    a tool call, ``http_request`` for a proxy call."""

    action: t.Literal["continue"]
    override: te.NotRequired[
        t.Union[SessionWebhookToolCallChange, SessionWebhookHttpRequestChange, None]
    ]


class SessionWebhookAfterExecuteContinueResponse(te.TypedDict):
    """Passes the result on to the agent. ``override`` passes on a changed
    result: ``tool_response`` for a tool call, ``http_response`` for a proxy
    call."""

    action: t.Literal["continue"]
    override: te.NotRequired[
        t.Union[
            SessionWebhookToolResponseChange, SessionWebhookHttpResponseChange, None
        ]
    ]


SessionWebhookBeforeExecuteResponse = t.Union[
    SessionWebhookBeforeExecuteContinueResponse, SessionWebhookBlockResponse
]
"""The answer to a ``before_execute`` event."""

SessionWebhookAfterExecuteResponse = t.Union[
    SessionWebhookAfterExecuteContinueResponse, SessionWebhookBlockResponse
]
"""The answer to an ``after_execute`` event."""


# =============================================================================
# PARSE
# =============================================================================

_EVENT_ADAPTERS: t.Dict[str, pydantic.TypeAdapter[t.Any]] = {
    SessionWebhookEventType.BEFORE_EXECUTE.value: pydantic.TypeAdapter(
        SessionWebhookBeforeExecuteEvent
    ),
    SessionWebhookEventType.AFTER_EXECUTE.value: pydantic.TypeAdapter(
        SessionWebhookAfterExecuteEvent
    ),
}


class SessionWebhooks:
    """``composio.sessions.webhooks``: for the endpoint at a project's session
    webhook URL, which answers session hooks that have a ``webhook`` handler."""

    def parse(
        self,
        request: t.Any = None,
        *,
        body: t.Union[str, bytes, None] = None,
        headers: t.Union[t.Mapping[str, t.Any], None] = None,
        verify_secret: str,
        tolerance: int = 300,
    ) -> SessionWebhookEvent:
        """
        Verify and parse an event Composio sent to the session webhook URL.

        The signature is always verified, with the project's session webhook
        secret. The event is returned as Composio sent it, with the field
        names of the webhook reference.

        Pass a framework request object, or pass ``body=`` and ``headers=``
        explicitly. ``request`` may be any object exposing the request body and
        headers, such as a Flask or Django request. Because this SDK is
        synchronous, async frameworks must pass an already-read raw body, for
        example ``body=await request.body()``. Pass the raw, unparsed body: the
        signature covers its exact bytes.

        :param request: The incoming request object (Flask/Django)
        :param body: The raw request body (str/bytes); overrides ``request``
        :param headers: The request headers as a mapping; overrides ``request``
        :param verify_secret: The project's session webhook secret, shown once
            in the dashboard when the URL is saved or its secret is rotated
        :param tolerance: Max event age in seconds. Set to 0 to disable the check.
        :return: The verified event
        :raises ValidationError: If ``verify_secret`` is empty or the signature
            headers are missing
        :raises WebhookSignatureVerificationError: If signature verification fails
        :raises WebhookPayloadError: If the body is not a session webhook event

        Example:
            # Flask, at the project's session webhook URL
            @app.post('/composio/session-webhook')
            def session_webhook():
                try:
                    hook = composio.sessions.webhooks.parse(
                        request,
                        verify_secret=os.environ['COMPOSIO_SESSION_WEBHOOK_SECRET'],
                    )
                except exceptions.WebhookSignatureVerificationError:
                    return '', 401

                data = hook['data']
                if (
                    hook['type'] == 'composio.session_hook.before_execute'
                    and data['type'] == 'tool_execute'
                    and data['tool_call']['tool_slug'] == 'GMAIL_SEND_EMAIL'
                ):
                    return {'action': 'block', 'message': 'Sending email is not allowed'}
                return {'action': 'continue'}
        """
        payload = body_to_str(
            body if body is not None else extract_request_body(request)
        )
        raw_headers = (
            headers if headers is not None else getattr(request, "headers", None)
        )

        if not verify_secret:
            raise exceptions.ValidationError(
                "Cannot verify session webhook: `verify_secret` is empty — your "
                "COMPOSIO_SESSION_WEBHOOK_SECRET is likely unset. Set it to the "
                "project's session webhook secret from the Composio dashboard."
            )

        webhook_id = get_header(raw_headers, "webhook-id")
        timestamp = get_header(raw_headers, "webhook-timestamp")
        signature = get_header(raw_headers, "webhook-signature")
        if not webhook_id or not timestamp or not signature:
            missing = [
                name
                for name, value in (
                    ("webhook-id", webhook_id),
                    ("webhook-timestamp", timestamp),
                    ("webhook-signature", signature),
                )
                if not value
            ]
            raise exceptions.ValidationError(
                "Cannot verify session webhook: missing signature header(s) "
                f"{', '.join(repr(name) for name in missing)}. "
                "Pass the raw, unparsed request body and ensure the Composio "
                "signature headers (webhook-id, webhook-timestamp, "
                "webhook-signature) are forwarded to sessions.webhooks.parse()."
            )

        if tolerance > 0:
            validate_webhook_timestamp(timestamp, tolerance)
        verify_webhook_signature(
            webhook_id=webhook_id,
            webhook_timestamp=timestamp,
            payload=payload,
            signature=signature,
            secret=verify_secret,
        )

        try:
            event = json.loads(payload)
        except json.JSONDecodeError as e:
            raise exceptions.WebhookPayloadError(
                f"Failed to parse session webhook payload as JSON: {e}"
            ) from e

        event_type = event.get("type") if isinstance(event, dict) else None
        adapter = (
            _EVENT_ADAPTERS.get(event_type) if isinstance(event_type, str) else None
        )
        if adapter is None:
            raise exceptions.WebhookPayloadError(
                "Payload is not a session webhook event. Expected a "
                f"'{SessionWebhookEventType.BEFORE_EXECUTE.value}' or "
                f"'{SessionWebhookEventType.AFTER_EXECUTE.value}' event."
            )
        try:
            adapter.validate_python(event)
        except pydantic.ValidationError as e:
            # Name the fields, never their values: the event carries the call's data.
            fields = sorted(
                {".".join(str(part) for part in error["loc"]) for error in e.errors()}
            )
            raise exceptions.WebhookPayloadError(
                f"Session webhook event has missing or invalid fields: {', '.join(fields)}"
            ) from None

        # The event as sent, so fields this SDK version doesn't know stay on it.
        return t.cast(SessionWebhookEvent, event)
