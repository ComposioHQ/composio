"""LiteLLM provider for Composio SDK.

Routes to 100+ LLM providers (OpenAI, Anthropic, Azure, Bedrock,
Vertex AI, Groq, Together, Ollama, etc.) through litellm.completion().
See https://docs.litellm.ai/docs/providers for the full list.
"""

import json
import typing as t

from openai.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
)
from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam
from openai.types.shared_params.function_definition import FunctionDefinition
from openai.types.shared_params.function_parameters import FunctionParameters

from composio.core.provider import NonAgenticProvider
from composio.types import Modifiers, Tool, ToolExecutionResponse

LiteLLMTool: t.TypeAlias = ChatCompletionToolParam
LiteLLMToolCollection: t.TypeAlias = t.List[LiteLLMTool]


class LiteLLMProvider(
    NonAgenticProvider[LiteLLMTool, LiteLLMToolCollection], name="litellm"
):
    """Composio toolset for LiteLLM AI gateway.

    Wraps Composio tools in OpenAI-compatible format for use with
    litellm.completion(). Handles tool call responses from any of
    the 100+ providers LiteLLM supports.
    """

    def wrap_tool(self, tool: Tool) -> LiteLLMTool:
        return ChatCompletionToolParam(
            function=FunctionDefinition(
                name=tool.slug,
                description=tool.description,
                parameters=t.cast(FunctionParameters, tool.input_parameters),
                strict=None,
            ),
            type="function",
        )

    def wrap_tools(self, tools: t.Sequence[Tool]) -> LiteLLMToolCollection:
        return [self.wrap_tool(tool) for tool in tools]

    def execute_tool_call(
        self,
        user_id: str,
        tool_call: ChatCompletionMessageToolCall,
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse:
        """Execute a tool call from a LiteLLM response.

        :param user_id: User ID to use for executing the function call.
        :param tool_call: Tool call metadata from the LLM response.
        :param modifiers: Optional modifiers for tool execution.
        :return: Object containing output data from the tool call.
        """
        return self.execute_tool(
            slug=tool_call.function.name,
            arguments=json.loads(tool_call.function.arguments),
            modifiers=modifiers,
            user_id=user_id,
        )

    def handle_tool_calls(
        self,
        user_id: str,
        response: t.Any,
        modifiers: t.Optional[Modifiers] = None,
    ) -> t.List[ToolExecutionResponse]:
        """Handle tool calls from a litellm.completion() response.

        :param user_id: User ID to use for executing function calls.
        :param response: Response object from litellm.completion().
            This is a ModelResponse with OpenAI-compatible structure.
        :param modifiers: Optional modifiers for tool execution.
        :return: A list of output objects from the tool calls.
        """
        outputs = []
        for choice in response.choices:
            if choice.message.tool_calls is None:
                continue

            for tool_call in choice.message.tool_calls:
                outputs.append(
                    self.execute_tool_call(
                        user_id=user_id,
                        tool_call=t.cast(ChatCompletionMessageToolCall, tool_call),
                        modifiers=modifiers,
                    )
                )
        return outputs
