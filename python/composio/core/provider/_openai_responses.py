"""
OpenAI Responses API provider implementation.
"""

from __future__ import annotations

import typing as t

from openai.types.responses.response import Response
from openai.types.responses.response_output_item import ResponseFunctionToolCall

from composio.core.provider import NonAgenticProvider, ToolCallSession
from composio.types import Modifiers, Tool, ToolExecutionResponse
from composio.utils.json_schema import dereference_json_schema
from composio.utils.shared import normalize_tool_arguments
from composio.utils.strict_schema import to_strict_json_schema

# Responses API uses a flattened tool structure
ResponsesTool = dict[str, t.Any]
ResponsesToolCollection = list[ResponsesTool]


class OpenAIResponsesProvider(
    NonAgenticProvider[ResponsesTool, ResponsesToolCollection], name="openai_responses"
):
    """OpenAI Responses API Provider class definition."""

    def __init__(self, strict: bool = False) -> None:
        """
        :param strict: Normalize wrapped tool parameter schemas for OpenAI
            structured outputs (every object fully required and closed,
            nullable types via ``anyOf``, ``$ref``/``$defs`` inlined).
            Mirrors the TypeScript ``OpenAIResponsesProvider({ strict })``
            option. Defaults to ``False``.
        """
        self.strict = strict

    def wrap_tool(self, tool: Tool) -> ResponsesTool:
        """Wrap a tool for the Responses API format."""
        parameters: t.Any = tool.input_parameters or {}
        if (
            self.strict
            and isinstance(parameters, dict)
            and parameters.get("type") == "object"
        ):
            # Structured outputs reject schemas whose nested objects keep
            # optional properties or their own additionalProperties, so the
            # strict contract must be applied at every depth. Inline $refs
            # first; lenient mode keeps upstream schemas with dangling refs
            # usable.
            dereferenced = dereference_json_schema(parameters, on_unresolved="sentinel")
            parameters = to_strict_json_schema(dereferenced).schema
        return {
            "type": "function",
            "name": tool.slug,
            "description": tool.description,
            "parameters": parameters,
        }

    def wrap_tools(self, tools: t.Sequence[Tool]) -> ResponsesToolCollection:
        """Wrap multiple tools for the Responses API format."""
        return [self.wrap_tool(tool) for tool in tools]

    @t.overload
    def execute_tool_call(
        self,
        user_id: str,
        tool_call: ResponseFunctionToolCall,
        modifiers: Modifiers | None = None,
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
        user_id: str | None = None,
        tool_call: ResponseFunctionToolCall | None = None,
        modifiers: Modifiers | None = None,
        *,
        session: ToolCallSession | None = None,
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
        modifiers: Modifiers | None = None,
    ) -> list[ToolExecutionResponse]: ...

    @t.overload
    def handle_tool_calls(
        self,
        *,
        session: ToolCallSession,
        response: Response,
    ) -> list[ToolExecutionResponse]: ...

    def handle_tool_calls(
        self,
        user_id: str | None = None,
        response: Response | None = None,
        modifiers: Modifiers | None = None,
        *,
        session: ToolCallSession | None = None,
    ) -> list[ToolExecutionResponse]:
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
