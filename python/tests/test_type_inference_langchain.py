"""
Type inference verification tests for LangChain provider.

This file verifies that type checkers correctly infer `list[StructuredTool]`
when using the LangChain provider with Composio.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference_langchain.py

Requirements:
    - composio (core SDK)
    - composio-langchain
    - langchain-core
"""

from typing import TYPE_CHECKING

from composio import Composio

if TYPE_CHECKING:
    from typing_extensions import assert_type

    from composio_langchain.provider import StructuredTool

    from composio_langchain import LangchainProvider


def test_langchain_provider_toolkits() -> None:
    """Verify LangChain provider returns list[StructuredTool] for toolkits query."""
    if TYPE_CHECKING:
        composio: Composio[StructuredTool, list[StructuredTool]] = Composio(
            provider=LangchainProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Type checker should infer: list[StructuredTool]
        assert_type(tools, list[StructuredTool])


def test_langchain_provider_slug() -> None:
    """Verify LangChain provider returns list[StructuredTool] for slug query."""
    if TYPE_CHECKING:
        composio: Composio[StructuredTool, list[StructuredTool]] = Composio(
            provider=LangchainProvider()
        )
        tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

        assert_type(tools, list[StructuredTool])


def test_langchain_provider_tools_list() -> None:
    """Verify LangChain provider returns list[StructuredTool] for tools list query."""
    if TYPE_CHECKING:
        composio: Composio[StructuredTool, list[StructuredTool]] = Composio(
            provider=LangchainProvider()
        )
        tools = composio.tools.get(
            user_id="test",
            tools=["GITHUB_CREATE_REPO", "GITHUB_GET_USER"],
        )

        assert_type(tools, list[StructuredTool])


def test_langchain_provider_search() -> None:
    """Verify LangChain provider returns list[StructuredTool] for search query."""
    if TYPE_CHECKING:
        composio: Composio[StructuredTool, list[StructuredTool]] = Composio(
            provider=LangchainProvider()
        )
        tools = composio.tools.get(user_id="test", search="github repository")

        assert_type(tools, list[StructuredTool])


def test_langchain_provider_inferred() -> None:
    """Verify LangChain provider type is correctly inferred without explicit annotation."""
    if TYPE_CHECKING:
        composio = Composio(provider=LangchainProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Should infer list[StructuredTool] from provider type
        # Note: The provider's StructuredTool is a subclass of langchain_core's StructuredTool
        assert_type(tools, list[StructuredTool])
