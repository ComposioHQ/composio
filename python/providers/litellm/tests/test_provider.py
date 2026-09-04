"""Tests for LiteLLM provider."""

from unittest.mock import MagicMock, Mock

from openai.types.chat.chat_completion import ChatCompletion, Choice
from openai.types.chat.chat_completion_message import ChatCompletionMessage
from openai.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
    Function,
)

from composio_litellm import LiteLLMProvider


class TestLiteLLMProviderInit:
    def test_provider_name(self):
        provider = LiteLLMProvider()
        assert provider.name == "litellm"

    def test_is_non_agentic(self):
        from composio.core.provider import NonAgenticProvider

        provider = LiteLLMProvider()
        assert isinstance(provider, NonAgenticProvider)


class TestLiteLLMWrapTool:
    def test_wrap_tool_returns_openai_format(self):
        provider = LiteLLMProvider()
        tool = Mock()
        tool.slug = "GITHUB_STAR_REPO"
        tool.description = "Star a GitHub repo"
        tool.input_parameters = {
            "type": "object",
            "properties": {"repo": {"type": "string"}},
        }

        wrapped = provider.wrap_tool(tool)

        assert wrapped["type"] == "function"
        assert wrapped["function"]["name"] == "GITHUB_STAR_REPO"
        assert wrapped["function"]["description"] == "Star a GitHub repo"

    def test_wrap_tools_returns_list(self):
        provider = LiteLLMProvider()
        tools = []
        for slug in ["TOOL_A", "TOOL_B", "TOOL_C"]:
            tool = Mock()
            tool.slug = slug
            tool.description = f"Description of {slug}"
            tool.input_parameters = {"type": "object", "properties": {}}
            tools.append(tool)

        wrapped = provider.wrap_tools(tools)

        assert len(wrapped) == 3
        assert all(w["type"] == "function" for w in wrapped)
        assert [w["function"]["name"] for w in wrapped] == [
            "TOOL_A",
            "TOOL_B",
            "TOOL_C",
        ]


class TestLiteLLMExecuteToolCall:
    def test_execute_tool_call_parses_arguments(self):
        provider = LiteLLMProvider()
        provider.execute_tool = Mock(
            return_value={"data": {"starred": True}, "successful": True}
        )

        tool_call = ChatCompletionMessageToolCall(
            id="call_123",
            function=Function(
                name="GITHUB_STAR_REPO",
                arguments='{"repo": "composio/composio"}',
            ),
            type="function",
        )

        result = provider.execute_tool_call(
            user_id="test-user",
            tool_call=tool_call,
        )

        provider.execute_tool.assert_called_once_with(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
            modifiers=None,
            user_id="test-user",
        )
        assert result["successful"] is True


class TestLiteLLMHandleToolCalls:
    def test_handle_tool_calls_from_completion(self):
        provider = LiteLLMProvider()
        provider.execute_tool = Mock(
            return_value={"data": {"starred": True}, "successful": True}
        )

        tool_call = ChatCompletionMessageToolCall(
            id="call_123",
            function=Function(
                name="GITHUB_STAR_REPO",
                arguments='{"repo": "composio/composio"}',
            ),
            type="function",
        )

        completion = ChatCompletion(
            id="chatcmpl-123",
            choices=[
                Choice(
                    finish_reason="tool_calls",
                    index=0,
                    message=ChatCompletionMessage(
                        role="assistant",
                        content=None,
                        tool_calls=[tool_call],
                    ),
                )
            ],
            created=1234567890,
            model="gpt-4o",
            object="chat.completion",
        )

        results = provider.handle_tool_calls(
            user_id="test-user",
            response=completion,
        )

        assert len(results) == 1
        assert results[0]["successful"] is True

    def test_handle_tool_calls_no_tool_calls(self):
        provider = LiteLLMProvider()
        provider.execute_tool = Mock()

        completion = ChatCompletion(
            id="chatcmpl-123",
            choices=[
                Choice(
                    finish_reason="stop",
                    index=0,
                    message=ChatCompletionMessage(
                        role="assistant",
                        content="Hello!",
                        tool_calls=None,
                    ),
                )
            ],
            created=1234567890,
            model="gpt-4o",
            object="chat.completion",
        )

        results = provider.handle_tool_calls(
            user_id="test-user",
            response=completion,
        )

        assert len(results) == 0
        provider.execute_tool.assert_not_called()

    def test_handle_tool_calls_multiple(self):
        provider = LiteLLMProvider()
        provider.execute_tool = Mock(return_value={"data": {}, "successful": True})

        tool_calls = [
            ChatCompletionMessageToolCall(
                id=f"call_{i}",
                function=Function(
                    name=f"TOOL_{i}",
                    arguments="{}",
                ),
                type="function",
            )
            for i in range(3)
        ]

        completion = ChatCompletion(
            id="chatcmpl-123",
            choices=[
                Choice(
                    finish_reason="tool_calls",
                    index=0,
                    message=ChatCompletionMessage(
                        role="assistant",
                        content=None,
                        tool_calls=tool_calls,
                    ),
                )
            ],
            created=1234567890,
            model="gpt-4o",
            object="chat.completion",
        )

        results = provider.handle_tool_calls(
            user_id="test-user",
            response=completion,
        )

        assert len(results) == 3
        assert provider.execute_tool.call_count == 3

    def test_handle_tool_calls_litellm_model_response(self):
        """Test with a litellm ModelResponse (duck-typed as ChatCompletion)."""
        provider = LiteLLMProvider()
        provider.execute_tool = Mock(
            return_value={"data": {"result": "ok"}, "successful": True}
        )

        mock_response = MagicMock()
        mock_tool_call = MagicMock()
        mock_tool_call.function.name = "MY_TOOL"
        mock_tool_call.function.arguments = '{"key": "value"}'

        mock_choice = MagicMock()
        mock_choice.message.tool_calls = [mock_tool_call]
        mock_response.choices = [mock_choice]

        results = provider.handle_tool_calls(
            user_id="test-user",
            response=mock_response,
        )

        assert len(results) == 1
        assert results[0]["successful"] is True
