"""
OpenAI Responses API provider implementation.
"""

from __future__ import annotations

import typing as t

from openai.types.responses.response import Response
from openai.types.responses.response_output_item import ResponseFunctionToolCall

from composio.core.provider import NonAgenticProvider, ToolCallSession
from composio.types import Modifiers, Tool, ToolExecutionResponse
from composio.utils.shared import normalize_tool_arguments

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

    @t.overload
    def execute_tool_call(
        self,
        user_id: str,
        tool_call: t.Union[ResponseFunctionToolCall],
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse: ...

    @t.overload
    def execute_tool_call(
        self,
        *,
        session: ToolCallSession,
        tool_call: ResponseFunctionToolCall,
    ) -> ToolExecutionResponse: ...

    def execute_tool_call(
        self,
        user_id: t.Optional[str] = None,
        tool_call: t.Optional[ResponseFunctionToolCall] = None,
        modifiers: t.Optional[Modifiers] = None,
        *,
        session: t.Optional[ToolCallSession] = None,
    ) -> ToolExecutionResponse:
        """Execute a tool call from the Responses API.

        :param tool_call: Tool call metadata from Responses API.
        :param user_id: User ID for direct tool execution.
        :param session: Tool Router session that produced session tools.
        :param modifiers: Optional modifiers for tool execution.
        :return: Object containing output data from the tool call.
        """
        if tool_call is None:
            raise TypeError("tool_call is required")
        target = self.resolve_tool_call_execution_target(
            user_id=user_id, session=session
        )

        # OpenAI always serializes tool arguments as a JSON string; normalize
        # tolerates empty / object-shaped payloads too (issue #2406).
        slug = tool_call.name
        arguments = normalize_tool_arguments(tool_call.arguments)

        return self.execute_tool_for_target(
            target=target,
            slug=slug,
            arguments=arguments,
            modifiers=modifiers,
        )

    @t.overload
    def handle_tool_calls(
        self,
        user_id: str,
        response: Response,
        modifiers: t.Optional[Modifiers] = None,
    ) -> t.List[ToolExecutionResponse]: ...

    @t.overload
    def handle_tool_calls(
        self,
        *,
        session: ToolCallSession,
        response: Response,
    ) -> t.List[ToolExecutionResponse]: ...

    def handle_tool_calls(
        self,
        user_id: t.Optional[str] = None,
        response: t.Optional[Response] = None,
        modifiers: t.Optional[Modifiers] = None,
        *,
        session: t.Optional[ToolCallSession] = None,
    ) -> t.List[ToolExecutionResponse]:
        """
        Handle tool calls from OpenAI Responses API.

        :param response: Response object from openai.OpenAI.beta.responses.create
        :param user_id: User ID for direct tool execution.
        :param session: Tool Router session that produced session tools.
        :param modifiers: Optional modifiers for tool execution
        :return: List[ToolExecutionResponse] with tool execution results
        """
        if response is None:
            raise TypeError("response is required")
        self.resolve_tool_call_execution_target(user_id=user_id, session=session)
        if session is not None and modifiers is not None:
            raise ValueError(
                "Direct execution modifiers cannot be used with a Tool Router session"
            )
        outputs = []

        if response.output:
            for item in response.output:
                if isinstance(item, ResponseFunctionToolCall):
                    result = (
                        self.execute_tool_call(
                            session=session,
                            tool_call=item,
                        )
                        if session is not None
                        else self.execute_tool_call(
                            user_id=t.cast(str, user_id),
                            tool_call=item,
                            modifiers=modifiers,
                        )
                    )
                    outputs.append(result)

        return outputs
