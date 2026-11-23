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

from composio import AsyncComposio, Composio
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
    from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam
    from typing_extensions import assert_type


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


def test_auth_config_response_types() -> None:
    """SDK mutation results retain the generated client's Pydantic types."""
    if TYPE_CHECKING:
        from composio_client.types.auth_config_delete_response import (
            AuthConfigDeleteResponse,
        )
        from composio_client.types.auth_config_update_response import (
            AuthConfigUpdateResponse,
        )
        from composio_client.types.auth_config_update_status_response import (
            AuthConfigUpdateStatusResponse,
        )

        composio = Composio()
        custom = composio.auth_configs.update(
            "ac_test",
            options={"type": "custom", "credentials": {"scopes": "read:user"}},
        )
        default = composio.auth_configs.update(
            "ac_test", options={"type": "default", "is_enabled_for_tool_router": True}
        )
        deleted = composio.auth_configs.delete("ac_test")
        enabled = composio.auth_configs.enable("ac_test")
        disabled = composio.auth_configs.disable("ac_test")

        assert_type(custom, AuthConfigUpdateResponse)
        assert_type(default, AuthConfigUpdateResponse)
        assert_type(deleted, AuthConfigDeleteResponse)
        assert_type(enabled, AuthConfigUpdateStatusResponse)
        assert_type(disabled, AuthConfigUpdateStatusResponse)
        assert_type(custom.success, bool)
        assert_type(default.message, str)
        assert_type(deleted.revoke_job_id, str | None)
        assert_type(enabled.success, bool)
        assert_type(disabled.message, str)
        assert_type(custom.model_dump(), dict[str, Any])


def test_auth_config_create_option_types() -> None:
    """create accepts managed_app_id and still accepts the generated options type."""
    if TYPE_CHECKING:
        from composio_client.types.auth_config_create_params import (
            AuthConfigUnionMember0,
        )
        from composio_client.types.auth_config_create_response import AuthConfig

        composio = Composio()
        on_app = composio.auth_configs.create(
            "slack",
            {"type": "use_composio_managed_auth", "managed_app_id": "ma_test"},
        )
        generated: AuthConfigUnionMember0 = {"type": "use_composio_managed_auth"}
        on_default = composio.auth_configs.create("slack", generated)

        assert_type(on_app, AuthConfig)
        assert_type(on_default, AuthConfig)


if TYPE_CHECKING:

    async def verify_async_provider_inference() -> None:
        async with AsyncComposio() as client:
            assert_type(
                await client.tools.get(user_id="u", tools=["A"]),
                list[ChatCompletionToolParam],
            )
            session = await client.create(user_id="u", mcp=True)
            assert_type(await session.tools(), list[ChatCompletionToolParam])
            await session.delete()

        async with AsyncComposio(provider=OpenAIResponsesProvider()) as responses:
            attached = await responses.use("session-id")
            assert_type(await attached.tools(), ResponsesToolCollection)
