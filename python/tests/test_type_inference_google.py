"""
Type inference verification tests for Google (Vertex AI) provider.

This file verifies that type checkers correctly infer `list[FunctionDeclaration]`
when using the Google provider with Composio.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference_google.py

Requirements:
    - composio (core SDK)
    - composio-google
    - google-cloud-aiplatform
"""

from typing import TYPE_CHECKING

from composio import Composio

if TYPE_CHECKING:
    from typing_extensions import assert_type

    from vertexai.generative_models import FunctionDeclaration

    from composio_google import GoogleProvider


def test_google_provider_toolkits() -> None:
    """Verify Google provider returns list[FunctionDeclaration] for toolkits query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionDeclaration, list[FunctionDeclaration]] = Composio(
            provider=GoogleProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Type checker should infer: list[FunctionDeclaration]
        assert_type(tools, list[FunctionDeclaration])


def test_google_provider_slug() -> None:
    """Verify Google provider returns list[FunctionDeclaration] for slug query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionDeclaration, list[FunctionDeclaration]] = Composio(
            provider=GoogleProvider()
        )
        tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

        assert_type(tools, list[FunctionDeclaration])


def test_google_provider_tools_list() -> None:
    """Verify Google provider returns list[FunctionDeclaration] for tools list query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionDeclaration, list[FunctionDeclaration]] = Composio(
            provider=GoogleProvider()
        )
        tools = composio.tools.get(
            user_id="test",
            tools=["GITHUB_CREATE_REPO", "GITHUB_GET_USER"],
        )

        assert_type(tools, list[FunctionDeclaration])


def test_google_provider_search() -> None:
    """Verify Google provider returns list[FunctionDeclaration] for search query."""
    if TYPE_CHECKING:
        composio: Composio[FunctionDeclaration, list[FunctionDeclaration]] = Composio(
            provider=GoogleProvider()
        )
        tools = composio.tools.get(user_id="test", search="github repository")

        assert_type(tools, list[FunctionDeclaration])


def test_google_provider_inferred() -> None:
    """Verify Google provider type is correctly inferred without explicit annotation."""
    if TYPE_CHECKING:
        composio = Composio(provider=GoogleProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Should infer list[FunctionDeclaration] from provider type
        assert_type(tools, list[FunctionDeclaration])
