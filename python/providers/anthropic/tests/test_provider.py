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


def test_wrap_tools_attaches_cache_control_to_every_tool():
    """The cache breakpoint applies uniformly across a batch of tools, not
    just the first/last one.
    """
    tools = [_tool(slug="TOOL_A"), _tool(slug="TOOL_B"), _tool(slug="TOOL_C")]

    wrapped_tools = AnthropicProvider(cache_tools=True).wrap_tools(tools)

    assert all(t["cache_control"] == {"type": "ephemeral"} for t in wrapped_tools)


def test_wrap_tool_still_preserves_schema_and_metadata_with_caching_enabled():
    """Enabling caching must not change the wrapped tool's schema/name/description."""
    tool = _tool()

    wrapped = AnthropicProvider(cache_tools=True).wrap_tool(tool)

    assert wrapped["name"] == tool.slug
    assert wrapped["description"] == tool.description
    assert wrapped["input_schema"] == tool.input_parameters
