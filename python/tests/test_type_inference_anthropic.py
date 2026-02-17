"""
Type inference verification tests for Anthropic provider.

This file verifies that type checkers correctly infer `list[ToolParam]`
when using the Anthropic provider with Composio.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference_anthropic.py

Requirements:
    - composio (core SDK)
    - composio-anthropic
    - anthropic
"""

from typing import TYPE_CHECKING

from composio import Composio

if TYPE_CHECKING:
    from typing_extensions import assert_type

    from anthropic.types.tool_param import ToolParam

    from composio_anthropic import AnthropicProvider


def test_anthropic_provider_toolkits() -> None:
    """Verify Anthropic provider returns list[ToolParam] for toolkits query."""
    if TYPE_CHECKING:
        composio: Composio[ToolParam, list[ToolParam]] = Composio(
            provider=AnthropicProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Type checker should infer: list[ToolParam]
        assert_type(tools, list[ToolParam])


def test_anthropic_provider_slug() -> None:
    """Verify Anthropic provider returns list[ToolParam] for slug query."""
    if TYPE_CHECKING:
        composio: Composio[ToolParam, list[ToolParam]] = Composio(
            provider=AnthropicProvider()
        )
        tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

        assert_type(tools, list[ToolParam])


def test_anthropic_provider_tools_list() -> None:
    """Verify Anthropic provider returns list[ToolParam] for tools list query."""
    if TYPE_CHECKING:
        composio: Composio[ToolParam, list[ToolParam]] = Composio(
            provider=AnthropicProvider()
        )
        tools = composio.tools.get(
            user_id="test",
            tools=["GITHUB_CREATE_REPO", "GITHUB_GET_USER"],
        )

        assert_type(tools, list[ToolParam])


def test_anthropic_provider_search() -> None:
    """Verify Anthropic provider returns list[ToolParam] for search query."""
    if TYPE_CHECKING:
        composio: Composio[ToolParam, list[ToolParam]] = Composio(
            provider=AnthropicProvider()
        )
        tools = composio.tools.get(user_id="test", search="github repository")

        assert_type(tools, list[ToolParam])


def test_anthropic_provider_inferred() -> None:
    """Verify Anthropic provider type is correctly inferred without explicit annotation."""
    if TYPE_CHECKING:
        composio = Composio(provider=AnthropicProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Should infer list[ToolParam] from provider type
        assert_type(tools, list[ToolParam])
