"""
Type inference verification tests for OpenAI Agents provider.

This file verifies that type checkers correctly infer `list[FunctionTool]`
when using the OpenAI Agents provider with Composio.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference_openai_agents.py

Requirements:
    - composio (core SDK)
    - composio-openai-agents
    - openai-agents
"""

from typing import TYPE_CHECKING

from composio import Composio

if TYPE_CHECKING:
    from typing_extensions import assert_type

    from agents import FunctionTool

    from composio_openai_agents import OpenAIAgentsProvider


def test_openai_agents_provider_toolkits() -> None:
    """Verify OpenAI Agents provider returns list[FunctionTool] for toolkits query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionTool, list[FunctionTool]] = Composio(
            provider=OpenAIAgentsProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Type checker should infer: list[FunctionTool]
        assert_type(tools, list[FunctionTool])


def test_openai_agents_provider_slug() -> None:
    """Verify OpenAI Agents provider returns list[FunctionTool] for slug query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionTool, list[FunctionTool]] = Composio(
            provider=OpenAIAgentsProvider()
        )
        tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

        assert_type(tools, list[FunctionTool])


def test_openai_agents_provider_tools_list() -> None:
    """Verify OpenAI Agents provider returns list[FunctionTool] for tools list query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionTool, list[FunctionTool]] = Composio(
            provider=OpenAIAgentsProvider()
        )
        tools = composio.tools.get(
            user_id="test",
            tools=["GITHUB_CREATE_REPO", "GITHUB_GET_USER"],
        )

        assert_type(tools, list[FunctionTool])


def test_openai_agents_provider_search() -> None:
    """Verify OpenAI Agents provider returns list[FunctionTool] for search query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionTool, list[FunctionTool]] = Composio(
            provider=OpenAIAgentsProvider()
        )
        tools = composio.tools.get(user_id="test", search="github repository")

        assert_type(tools, list[FunctionTool])


def test_openai_agents_provider_inferred() -> None:
    """Verify OpenAI Agents provider type is correctly inferred without explicit annotation."""
    if TYPE_CHECKING:
        composio = Composio(provider=OpenAIAgentsProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Should infer list[FunctionTool] from provider type
        assert_type(tools, list[FunctionTool])
