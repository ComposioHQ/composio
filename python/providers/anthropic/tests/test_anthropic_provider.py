"""Tests for the Anthropic provider."""

import json
from unittest.mock import MagicMock

import httpx
import pytest
from anthropic.types import Message, ToolUseBlock
from composio_anthropic.provider import AnthropicProvider
from composio_client import AuthenticationError, ProjectAuth

from composio.client import HttpClient
from composio.core.models.tool_router_session import ToolRouterSession


def _tool(slug="SEARCH_TOOL", description="Search for information"):
    return MagicMock(
        slug=slug,
        description=description,
        input_parameters={
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    )


def test_wrap_tool_omits_cache_control_by_default():
    """No `cache_tools` option means no cache_control on the wrapped tool."""
    wrapped = AnthropicProvider().wrap_tool(_tool())

    assert "cache_control" not in wrapped


def test_wrap_tool_attaches_ephemeral_cache_control_when_cache_tools_enabled():
    """`cache_tools=True` attaches Anthropic's ephemeral cache breakpoint to
    the tool `wrap_tool` returns.
    """
    wrapped = AnthropicProvider(cache_tools=True).wrap_tool(_tool())

    assert wrapped["cache_control"] == {"type": "ephemeral"}


def test_wrap_tools_caches_only_the_last_tool():
    """`wrap_tools` places a single breakpoint on the last tool: a breakpoint
    caches everything up to and including it, so one is enough to cover the
    whole tool list. Anthropic caps requests at 4 breakpoints total (shared
    with the system prompt and messages); a breakpoint on every tool would
    blow past that limit once a caller passes 5+ tools.
    """
    tools = [_tool(slug="TOOL_A"), _tool(slug="TOOL_B"), _tool(slug="TOOL_C")]

    wrapped_tools = AnthropicProvider(cache_tools=True).wrap_tools(tools)

    assert all("cache_control" not in t for t in wrapped_tools[:-1])
    assert wrapped_tools[-1]["cache_control"] == {"type": "ephemeral"}


def test_wrap_tools_single_tool_still_gets_cache_control():
    """A batch of exactly one tool is also "the last tool" and should still
    be cached.
    """
    wrapped_tools = AnthropicProvider(cache_tools=True).wrap_tools([_tool()])

    assert wrapped_tools[-1]["cache_control"] == {"type": "ephemeral"}


def test_wrap_tools_omits_cache_control_by_default():
    """No `cache_tools` option means no cache_control anywhere in the batch,
    including the last tool.
    """
    tools = [_tool(slug="TOOL_A"), _tool(slug="TOOL_B")]

    wrapped_tools = AnthropicProvider().wrap_tools(tools)

    assert all("cache_control" not in t for t in wrapped_tools)


def test_wrap_tool_still_preserves_schema_and_metadata_with_caching_enabled():
    """Enabling caching must not change the wrapped tool's schema/name/description."""
    tool = _tool()

    wrapped = AnthropicProvider(cache_tools=True).wrap_tool(tool)

    assert wrapped["name"] == tool.slug
    assert wrapped["description"] == tool.description
    assert wrapped["input_schema"] == tool.input_parameters


@pytest.mark.parametrize("target", ["session", "direct"])
def test_tool_results_preserve_call_ids_and_explicit_outcomes(target):
    """Repeated tool names must remain correlated, even when failure has no error."""
    provider = AnthropicProvider()
    payloads = iter(
        [
            {
                "data": {"value": "found"},
                "error": None,
                "result_type": "completed",
                "log_id": "log-first",
                "instant_charge": {
                    "amount": "0.01",
                    "currency": "USD",
                    "charged_by": "composio",
                },
            },
            {
                "data": {},
                "error": "",
                "result_type": "failed",
                "log_id": "log-second",
            },
        ]
    )

    def respond(request):
        return httpx.Response(200, json=next(payloads))

    message = Message(
        id="message",
        model="test",
        role="assistant",
        type="message",
        stop_reason="tool_use",
        usage={"input_tokens": 1, "output_tokens": 1},
        content=[
            {"type": "tool_use", "id": "use-first", "name": "SEARCH", "input": {}},
            {"type": "text", "text": "Checking another result."},
            {"type": "tool_use", "id": "use-second", "name": "SEARCH", "input": {}},
        ],
    )
    with HttpClient(
        provider="anthropic",
        auth=ProjectAuth("test-key"),
        base_url="https://backend.invalid",
        http_client=httpx.Client(transport=httpx.MockTransport(respond)),
    ) as client:
        session = ToolRouterSession(
            client=client,
            provider=provider,
            dangerously_allow_auto_upload_download_files=False,
            session_id="session",
            mcp=None,
            experimental={},
        )
        if target == "session":
            results = provider.handle_tool_calls(session=session, response=message)
        else:
            # Keep the real direct-result dictionary to check that adding correlation
            # doesn't mutate an executor's result (it may be shared with a modifier).
            direct_results = [
                {"data": {"value": "found"}, "error": None, "successful": True},
                {"data": {}, "error": "", "successful": False},
            ]
            pending = iter(direct_results)
            provider.set_execute_tool_fn(lambda *args, **kwargs: next(pending))
            results = provider.handle_tool_calls(user_id="user", response=message)
            assert all("tool_use_id" not in result for result in direct_results)

    assert [result["tool_use_id"] for result in results] == ["use-first", "use-second"]
    assert [result["successful"] for result in results] == [True, False]
    assert results[1]["error"] == ""
    if target == "session":
        assert [result["result_type"] for result in results] == ["completed", "failed"]
        assert [result["log_id"] for result in results] == ["log-first", "log-second"]
        assert json.loads(json.dumps(results[0]))["instant_charge"]["amount"] == "0.01"
        assert "instant_charge" not in results[1]


def test_tool_call_does_not_turn_auth_failure_into_tool_failure():
    provider = AnthropicProvider()

    def respond(request):
        return httpx.Response(401, json={"message": "Invalid test credentials"})

    with HttpClient(
        provider="anthropic",
        auth=ProjectAuth("test-key"),
        base_url="https://backend.invalid",
        http_client=httpx.Client(transport=httpx.MockTransport(respond)),
    ) as client:
        session = ToolRouterSession(
            client=client,
            provider=provider,
            dangerously_allow_auto_upload_download_files=False,
            session_id="session",
            mcp=None,
            experimental={},
        )
        with pytest.raises(AuthenticationError):
            provider.execute_tool_call(
                session=session,
                tool_call=ToolUseBlock(
                    type="tool_use", id="use-auth", name="SEARCH", input={}
                ),
            )
