# mypy: warn-unused-ignores
"""Static assertions for the public session webhook reply types."""

from typing_extensions import TypedDict

from composio import (
    SessionWebhookAfterExecuteResponse,
    SessionWebhookBeforeExecuteResponse,
)
from composio.core.models.session_webhooks import (
    SessionWebhookBinaryBody,
    SessionWebhookHttpRequestOverride,
    SessionWebhookHttpResponseOverride,
    SessionWebhookToolCallOverride,
    SessionWebhookToolResponseOverride,
)


class MixedCallOverride(TypedDict):
    tool_call: SessionWebhookToolCallOverride
    http_request: SessionWebhookHttpRequestOverride


class MixedResultOverride(TypedDict):
    tool_response: SessionWebhookToolResponseOverride
    http_response: SessionWebhookHttpResponseOverride


class MixedProxyBody(TypedDict):
    body: object
    binary_body: SessionWebhookBinaryBody


class MixedFile(TypedDict):
    url: str
    base64: str


mixed_call: MixedCallOverride = {
    "tool_call": {"arguments": {}},
    "http_request": {"endpoint": "/user"},
}
mixed_result: MixedResultOverride = {
    "tool_response": {"data": {}},
    "http_response": {"data": None},
}
invalid_before: SessionWebhookBeforeExecuteResponse = {
    "action": "continue",
    "override": mixed_call,  # type: ignore[typeddict-item]
}
invalid_after: SessionWebhookAfterExecuteResponse = {
    "action": "continue",
    "override": mixed_result,  # type: ignore[typeddict-item]
}
valid_upload: SessionWebhookBeforeExecuteResponse = {
    "action": "continue",
    "override": {
        "http_request": {"binary_body": {"base64": "Zm9v"}},
        "tool_call": None,
    },
}
valid_result: SessionWebhookAfterExecuteResponse = {
    "action": "continue",
    "override": {"tool_response": {"data": {}}, "http_response": None},
}
mixed_body: MixedProxyBody = {
    "body": None,
    "binary_body": {"url": "https://example.com/file"},
}
invalid_body: SessionWebhookHttpRequestOverride = mixed_body  # type: ignore[assignment]
mixed_file: MixedFile = {"url": "https://example.com/file", "base64": "Zm9v"}
invalid_file: SessionWebhookHttpRequestOverride = {
    "binary_body": mixed_file,  # type: ignore[typeddict-item]
}
