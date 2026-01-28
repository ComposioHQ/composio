"""
Type inference verification tests for Google ADK provider.

This file verifies that type checkers correctly infer `list[FunctionTool]`
when using the Google ADK provider with Composio.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference_google_adk.py

Requirements:
    - composio (core SDK)
    - composio-google-adk
    - google-adk
"""

from typing import TYPE_CHECKING

from composio import Composio

if TYPE_CHECKING:
    from typing_extensions import assert_type

    from google.adk.tools import FunctionTool

    from composio_google_adk import GoogleAdkProvider


def test_google_adk_provider_toolkits() -> None:
    """Verify Google ADK provider returns list[FunctionTool] for toolkits query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionTool, list[FunctionTool]] = Composio(
            provider=GoogleAdkProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Type checker should infer: list[FunctionTool]
        assert_type(tools, list[FunctionTool])


def test_google_adk_provider_slug() -> None:
    """Verify Google ADK provider returns list[FunctionTool] for slug query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionTool, list[FunctionTool]] = Composio(
            provider=GoogleAdkProvider()
        )
        tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

        assert_type(tools, list[FunctionTool])


def test_google_adk_provider_tools_list() -> None:
    """Verify Google ADK provider returns list[FunctionTool] for tools list query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionTool, list[FunctionTool]] = Composio(
            provider=GoogleAdkProvider()
        )
        tools = composio.tools.get(
            user_id="test",
            tools=["GITHUB_CREATE_REPO", "GITHUB_GET_USER"],
        )

        assert_type(tools, list[FunctionTool])


def test_google_adk_provider_search() -> None:
    """Verify Google ADK provider returns list[FunctionTool] for search query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionTool, list[FunctionTool]] = Composio(
            provider=GoogleAdkProvider()
        )
        tools = composio.tools.get(user_id="test", search="github repository")

        assert_type(tools, list[FunctionTool])


def test_google_adk_provider_inferred() -> None:
    """Verify Google ADK provider type is correctly inferred without explicit annotation."""
    if TYPE_CHECKING:
        composio = Composio(provider=GoogleAdkProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Should infer list[FunctionTool] from provider type
        assert_type(tools, list[FunctionTool])
