"""Tests for the Anthropic provider."""

from unittest.mock import MagicMock

from composio_anthropic.provider import AnthropicProvider


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
    """No `cacheTools` option means no cache_control on the wrapped tool."""
    wrapped = AnthropicProvider().wrap_tool(_tool())

    assert "cache_control" not in wrapped


def test_wrap_tool_attaches_ephemeral_cache_control_when_cache_tools_enabled():
    """`cache_tools=True` attaches Anthropic's ephemeral cache breakpoint to
    every wrapped tool, mirroring the TypeScript
    `AnthropicProvider({ cacheTools: true })` option.
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
