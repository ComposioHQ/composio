"""
Type inference verification tests for Claude Agent SDK provider.

This file verifies that type checkers correctly infer `list[Tool]`
when using the Claude Agent SDK provider with Composio.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference_claude_agent_sdk.py

Requirements:
    - composio (core SDK)
    - composio-claude-agent-sdk
    - mcp
"""

from typing import TYPE_CHECKING

from composio import Composio

if TYPE_CHECKING:
    from typing_extensions import assert_type

    from mcp.types import Tool as SdkMcpTool

    from composio_claude_agent_sdk import ClaudeAgentSDKProvider


def test_claude_agent_sdk_provider_toolkits() -> None:
    """Verify Claude Agent SDK provider returns list[Tool] for toolkits query."""
    if TYPE_CHECKING:
        composio: Composio[ClaudeAgentSDKProvider] = Composio(
            provider=ClaudeAgentSDKProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Type checker should infer: list[Tool]
        assert_type(tools, list[SdkMcpTool])


def test_claude_agent_sdk_provider_slug() -> None:
    """Verify Claude Agent SDK provider returns list[Tool] for slug query."""
    if TYPE_CHECKING:
        composio: Composio[ClaudeAgentSDKProvider] = Composio(
            provider=ClaudeAgentSDKProvider()
        )
        tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

        assert_type(tools, list[SdkMcpTool])


def test_claude_agent_sdk_provider_tools_list() -> None:
    """Verify Claude Agent SDK provider returns list[Tool] for tools list query."""
    if TYPE_CHECKING:
        composio: Composio[ClaudeAgentSDKProvider] = Composio(
            provider=ClaudeAgentSDKProvider()
        )
        tools = composio.tools.get(
            user_id="test",
            tools=["GITHUB_CREATE_REPO", "GITHUB_GET_USER"],
        )

        assert_type(tools, list[SdkMcpTool])


def test_claude_agent_sdk_provider_search() -> None:
    """Verify Claude Agent SDK provider returns list[Tool] for search query."""
    if TYPE_CHECKING:
        composio: Composio[ClaudeAgentSDKProvider] = Composio(
            provider=ClaudeAgentSDKProvider()
        )
        tools = composio.tools.get(user_id="test", search="github repository")

        assert_type(tools, list[SdkMcpTool])


def test_claude_agent_sdk_provider_inferred() -> None:
    """Verify Claude Agent SDK provider type is correctly inferred without explicit annotation."""
    if TYPE_CHECKING:
        composio = Composio(provider=ClaudeAgentSDKProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Should infer list[Tool] from provider type
        assert_type(tools, list[SdkMcpTool])
