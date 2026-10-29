"""
Type inference verification tests for OpenAI provider.

This file verifies that type checkers correctly infer `list[ChatCompletionToolParam]`
when using the OpenAI provider with Composio.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference_openai.py

Requirements:
    - composio (core SDK)
    - composio-openai
    - openai
"""

from typing import TYPE_CHECKING

from composio import Composio

if TYPE_CHECKING:
    from typing_extensions import assert_type

    from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam

    from composio_openai import OpenAIProvider


def test_openai_provider_toolkits() -> None:
    """Verify OpenAI provider returns list[ChatCompletionToolParam] for toolkits query."""
    if TYPE_CHECKING:
        composio: Composio[ChatCompletionToolParam, list[ChatCompletionToolParam]] = Composio(
            provider=OpenAIProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Type checker should infer: list[ChatCompletionToolParam]
        assert_type(tools, list[ChatCompletionToolParam])


def test_openai_provider_slug() -> None:
    """Verify OpenAI provider returns list[ChatCompletionToolParam] for slug query."""
    if TYPE_CHECKING:
        composio: Composio[ChatCompletionToolParam, list[ChatCompletionToolParam]] = Composio(
            provider=OpenAIProvider()
        )
        tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

        assert_type(tools, list[ChatCompletionToolParam])


def test_openai_provider_tools_list() -> None:
    """Verify OpenAI provider returns list[ChatCompletionToolParam] for tools list query."""
    if TYPE_CHECKING:
        composio: Composio[ChatCompletionToolParam, list[ChatCompletionToolParam]] = Composio(
            provider=OpenAIProvider()
        )
        tools = composio.tools.get(
            user_id="test",
            tools=["GITHUB_CREATE_REPO", "GITHUB_GET_USER"],
        )

        assert_type(tools, list[ChatCompletionToolParam])


def test_openai_provider_search() -> None:
    """Verify OpenAI provider returns list[ChatCompletionToolParam] for search query."""
    if TYPE_CHECKING:
        composio: Composio[ChatCompletionToolParam, list[ChatCompletionToolParam]] = Composio(
            provider=OpenAIProvider()
        )
        tools = composio.tools.get(user_id="test", search="github repository")

        assert_type(tools, list[ChatCompletionToolParam])


def test_openai_provider_inferred() -> None:
    """Verify OpenAI provider type is correctly inferred without explicit annotation."""
    if TYPE_CHECKING:
        composio = Composio(provider=OpenAIProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Should infer list[ChatCompletionToolParam] from provider type
        assert_type(tools, list[ChatCompletionToolParam])
