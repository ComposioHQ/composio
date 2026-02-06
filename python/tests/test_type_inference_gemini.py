"""
Type inference verification tests for Gemini provider.

This file verifies that type checkers correctly infer `list[Any]`
when using the Gemini provider with Composio.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference_gemini.py

Requirements:
    - composio (core SDK)
    - composio-gemini
"""

from typing import TYPE_CHECKING, Any, Callable

from composio import Composio

if TYPE_CHECKING:
    from typing_extensions import assert_type

    from composio_gemini import GeminiProvider


def test_gemini_provider_toolkits() -> None:
    """Verify Gemini provider returns list[Callable[..., Any]] for toolkits query."""
    if TYPE_CHECKING:
        composio: Composio[Callable[..., Any], list[Callable[..., Any]]] = Composio(
            provider=GeminiProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Type checker should infer: list[Callable[..., Any]]
        assert_type(tools, list[Callable[..., Any]])


def test_gemini_provider_slug() -> None:
    """Verify Gemini provider returns list[Callable[..., Any]] for slug query."""
    if TYPE_CHECKING:
        composio: Composio[Callable[..., Any], list[Callable[..., Any]]] = Composio(
            provider=GeminiProvider()
        )
        tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

        assert_type(tools, list[Callable[..., Any]])


def test_gemini_provider_tools_list() -> None:
    """Verify Gemini provider returns list[Callable[..., Any]] for tools list query."""
    if TYPE_CHECKING:
        composio: Composio[Callable[..., Any], list[Callable[..., Any]]] = Composio(
            provider=GeminiProvider()
        )
        tools = composio.tools.get(
            user_id="test",
            tools=["GITHUB_CREATE_REPO", "GITHUB_GET_USER"],
        )

        assert_type(tools, list[Callable[..., Any]])


def test_gemini_provider_search() -> None:
    """Verify Gemini provider returns list[Callable[..., Any]] for search query."""
    if TYPE_CHECKING:
        composio: Composio[Callable[..., Any], list[Callable[..., Any]]] = Composio(
            provider=GeminiProvider()
        )
        tools = composio.tools.get(user_id="test", search="github repository")

        assert_type(tools, list[Callable[..., Any]])


def test_gemini_provider_inferred() -> None:
    """Verify Gemini provider type is correctly inferred without explicit annotation."""
    if TYPE_CHECKING:
        composio = Composio(provider=GeminiProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Should infer list[Callable[..., Any]] from provider type
        assert_type(tools, list[Callable[..., Any]])
