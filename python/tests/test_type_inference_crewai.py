"""
Type inference verification tests for CrewAI provider.

This file verifies that type checkers correctly infer `list[BaseTool]`
when using the CrewAI provider with Composio.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference_crewai.py

Requirements:
    - composio (core SDK)
    - composio-crewai
    - crewai
"""

from typing import TYPE_CHECKING

from composio import Composio

if TYPE_CHECKING:
    from typing_extensions import assert_type

    from crewai.tools import BaseTool

    from composio_crewai import CrewAIProvider


def test_crewai_provider_toolkits() -> None:
    """Verify CrewAI provider returns list[BaseTool] for toolkits query."""
    if TYPE_CHECKING:
        composio: Composio[BaseTool, list[BaseTool]] = Composio(
            provider=CrewAIProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Type checker should infer: list[BaseTool]
        assert_type(tools, list[BaseTool])


def test_crewai_provider_slug() -> None:
    """Verify CrewAI provider returns list[BaseTool] for slug query."""
    if TYPE_CHECKING:
        composio: Composio[BaseTool, list[BaseTool]] = Composio(
            provider=CrewAIProvider()
        )
        tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

        assert_type(tools, list[BaseTool])


def test_crewai_provider_tools_list() -> None:
    """Verify CrewAI provider returns list[BaseTool] for tools list query."""
    if TYPE_CHECKING:
        composio: Composio[BaseTool, list[BaseTool]] = Composio(
            provider=CrewAIProvider()
        )
        tools = composio.tools.get(
            user_id="test",
            tools=["GITHUB_CREATE_REPO", "GITHUB_GET_USER"],
        )

        assert_type(tools, list[BaseTool])


def test_crewai_provider_search() -> None:
    """Verify CrewAI provider returns list[BaseTool] for search query."""
    if TYPE_CHECKING:
        composio: Composio[BaseTool, list[BaseTool]] = Composio(
            provider=CrewAIProvider()
        )
        tools = composio.tools.get(user_id="test", search="github repository")

        assert_type(tools, list[BaseTool])


def test_crewai_provider_inferred() -> None:
    """Verify CrewAI provider type is correctly inferred without explicit annotation."""
    if TYPE_CHECKING:
        composio = Composio(provider=CrewAIProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Should infer list[BaseTool] from provider type
        assert_type(tools, list[BaseTool])
