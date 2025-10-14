"""
OpenAI Responses API provider implementation.
"""

from __future__ import annotations

import json
import typing as t

from openai.types.responses.response import Response
from openai.types.responses.response_output_item import ResponseFunctionToolCall

from composio.core.provider import NonAgenticProvider
from composio.types import Modifiers, Tool, ToolExecutionResponse

# Responses API uses a flattened tool structure
ResponsesTool = t.Dict[str, t.Any]
ResponsesToolCollection = t.List[ResponsesTool]


class OpenAIResponsesProvider(
    NonAgenticProvider[ResponsesTool, ResponsesToolCollection], name="openai_responses"
):
    """OpenAI Responses API Provider class definition."""

    def wrap_tool(self, tool: Tool) -> ResponsesTool:
        """Wrap a tool for the Responses API format."""
        return {
            "type": "function",
            "name": tool.slug,
            "description": tool.description,
            "parameters": tool.input_parameters,
        }

    def wrap_tools(self, tools: t.Sequence[Tool]) -> ResponsesToolCollection:
        """Wrap multiple tools for the Responses API format."""
        return [self.wrap_tool(tool) for tool in tools]

    def execute_tool_call(
        self,
        user_id: str,
        tool_call: t.Union[ResponseFunctionToolCall],
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse:
        """Execute a tool call from the Responses API.

        :param tool_call: Tool call metadata from Responses API.
        :param user_id: User ID to use for executing the function call.
        :param modifiers: Optional modifiers for tool execution.
        :return: Object containing output data from the tool call.
        """
        slug = tool_call.name
        arguments = json.loads(tool_call.arguments)

        return self.execute_tool(
            slug=slug,
            arguments=arguments,
            modifiers=modifiers,
            user_id=user_id,
        )

    def handle_tool_calls(
        self,
        user_id: str,
        response: Response,
        modifiers: t.Optional[Modifiers] = None,
    ) -> t.List[ToolExecutionResponse]:
        """
        Handle tool calls from OpenAI Responses API.

        :param response: Response object from openai.OpenAI.beta.responses.create
        :param user_id: User ID to use for executing the function call.
        :param modifiers: Optional modifiers for tool execution
        :return: List[ToolExecutionResponse] with tool execution results
        """
        outputs = []

        if response.output:
            for item in response.output:
                if isinstance(item, ResponseFunctionToolCall):
                    result = self.execute_tool_call(
                        user_id=user_id,
                        tool_call=item,
                        modifiers=modifiers,
                    )
                    outputs.append(result)

        return outputs
