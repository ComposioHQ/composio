"""
Type inference verification tests for the Composio SDK.

This file verifies that type checkers (mypy) correctly infer
provider-specific return types from `Composio.tools.get()`.

**This file is NOT executed at runtime.** It is analyzed statically by type
checkers to verify that type inference works correctly.

Run: mypy tests/test_type_inference.py

Requirements:
    - composio (core SDK)
    - openai (for type stubs)
"""

from typing import TYPE_CHECKING, Any

from composio import Composio
from composio.core.provider._openai import (
    OpenAIProvider,
    OpenAITool,
    OpenAIToolCollection,
)
from composio.core.provider._openai_responses import (
    OpenAIResponsesProvider,
    ResponsesTool,
    ResponsesToolCollection,
)

if TYPE_CHECKING:
    from typing_extensions import assert_type

    from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam


def test_openai_provider_explicit() -> None:
    """Verify OpenAI provider with explicit type returns list[ChatCompletionToolParam]."""
    composio: Composio[OpenAITool, OpenAIToolCollection] = Composio(
        provider=OpenAIProvider()
    )
    tools = composio.tools.get(user_id="test", toolkits=["github"])

    # Type checker should infer: list[ChatCompletionToolParam]
    if TYPE_CHECKING:
        assert_type(tools, list[ChatCompletionToolParam])


def test_openai_provider_inferred() -> None:
    """Verify OpenAI provider with inferred type returns list[ChatCompletionToolParam]."""
    composio = Composio(provider=OpenAIProvider())
    tools = composio.tools.get(user_id="test", toolkits=["github"])

    # Type checker should infer: list[ChatCompletionToolParam]
    if TYPE_CHECKING:
        assert_type(tools, list[ChatCompletionToolParam])


def test_default_provider() -> None:
    """Verify default provider (OpenAI) returns list[ChatCompletionToolParam]."""
    # Default provider is OpenAIProvider
    composio = Composio()
    tools = composio.tools.get(user_id="test", toolkits=["github"])

    # Type checker should infer: list[ChatCompletionToolParam]
    if TYPE_CHECKING:
        assert_type(tools, list[ChatCompletionToolParam])


def test_openai_provider_slug_parameter() -> None:
    """Verify slug parameter returns same type."""
    composio = Composio(provider=OpenAIProvider())
    tools = composio.tools.get(user_id="test", slug="GITHUB_CREATE_REPO")

    if TYPE_CHECKING:
        assert_type(tools, list[ChatCompletionToolParam])


def test_openai_provider_tools_parameter() -> None:
    """Verify tools parameter returns same type."""
    composio = Composio(provider=OpenAIProvider())
    tools = composio.tools.get(user_id="test", tools=["GITHUB_CREATE_REPO"])

    if TYPE_CHECKING:
        assert_type(tools, list[ChatCompletionToolParam])


def test_openai_provider_search_parameter() -> None:
    """Verify search parameter returns same type."""
    composio = Composio(provider=OpenAIProvider())
    tools = composio.tools.get(user_id="test", search="github")

    if TYPE_CHECKING:
        assert_type(tools, list[ChatCompletionToolParam])


def test_openai_responses_provider() -> None:
    """Verify OpenAI Responses provider returns list[dict]."""
    if TYPE_CHECKING:
        composio = Composio(provider=OpenAIResponsesProvider())
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        # Type checker should infer: list[Dict[str, Any]]
        # Note: ResponsesTool is typed as Dict[str, Any]
        assert_type(tools, list[dict[str, Any]])


def test_openai_responses_provider_explicit() -> None:
    """Verify OpenAI Responses provider with explicit generic types."""
    if TYPE_CHECKING:
        composio: Composio[ResponsesTool, ResponsesToolCollection] = Composio(
            provider=OpenAIResponsesProvider()
        )
        tools = composio.tools.get(user_id="test", toolkits=["github"])

        assert_type(tools, list[dict[str, Any]])
