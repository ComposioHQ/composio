"""
OpenAI Responses API provider implementation.
"""

from __future__ import annotations

import typing as t

from openai.types.responses.response import Response
from openai.types.responses.response_output_item import ResponseFunctionToolCall

from composio.core.provider import NonAgenticProvider, ToolCallSession
from composio.core.provider.base import BaseProviderConfig
from composio.types import Modifiers, Tool, ToolExecutionResponse
from composio.utils.logging import get as get_logger
from composio.utils.shared import normalize_tool_arguments
from composio.utils.strict_schema import omit_null_tool_arguments, to_strict_json_schema

logger = get_logger(__name__)

# Responses API uses a flattened tool structure
ResponsesTool = dict[str, t.Any]
ResponsesToolCollection = list[ResponsesTool]

# Parameters emitted for a tool without input parameters under strict mode.
_EMPTY_OBJECT_SCHEMA: dict[str, t.Any] = {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": False,
}


class OpenAIResponsesProvider(
    NonAgenticProvider[ResponsesTool, ResponsesToolCollection], name="openai_responses"
):
    """OpenAI Responses API Provider class definition."""

    def __init__(
        self, strict: bool = False, **kwargs: t.Unpack[BaseProviderConfig]
    ) -> None:
        """
        :param strict: Emit wrapped tools with ``strict: true`` and normalize
            their parameter schemas for OpenAI structured outputs (every object
            fully required and closed, optional properties widened to accept
            ``null``, local ``$ref``/``$defs`` kept). Mirrors the TypeScript
            ``OpenAIResponsesProvider({ strict })`` option. Defaults to
            ``False``.
        """
        super().__init__(**kwargs)
        self.strict = strict
        # Parameter schemas of the tools wrapped under strict mode, keyed by
        # slug, so tool-call arguments can be reconciled against the schema
        # the model actually saw.
        self._strict_input_schemas: dict[str, dict[str, t.Any]] = {}

    def wrap_tool(self, tool: Tool) -> ResponsesTool:
        """Wrap a tool for the Responses API format."""
        parameters: t.Any = (
            tool.input_parameters if tool.input_parameters is not None else {}
        )
        wrapped: ResponsesTool = {
            "type": "function",
            "name": tool.slug,
            "description": tool.description,
            "parameters": parameters,
            "strict": self.strict,
        }
        if not self.strict:
            return wrapped

        # Structured outputs enforce their contract at every depth: all
        # properties required, closed objects, no annotation keywords. The
        # strict rewrite keeps every parameter (optional ones become nullable)
        # and reports constructs it cannot express; such a tool is sent
        # without strict mode rather than with a narrower schema.
        source = (
            parameters
            if tool.input_parameters is not None
            else dict(_EMPTY_OBJECT_SCHEMA)
        )
        strict = to_strict_json_schema(source)
        if strict.unsupported:
            reasons = "; ".join(
                f"{entry.path or '<root>'}: {entry.keyword} ({entry.detail})"
                for entry in strict.unsupported
            )
            logger.warning(
                'OpenAIResponsesProvider: tool "%s" is sent without strict mode '
                "because its schema cannot be expressed as strict structured "
                "outputs: %s",
                tool.slug,
                reasons,
            )
            self._strict_input_schemas.pop(tool.slug, None)
            wrapped["parameters"] = source
            wrapped["strict"] = False
            return wrapped
        if strict.total_changes:
            logger.debug(
                'OpenAIResponsesProvider: strict mode rewrote %d node(s) of tool "%s": %s',
                strict.total_changes,
                tool.slug,
                "; ".join(f"{c.path}: {c.reason}" for c in strict.changes),
            )
        self._strict_input_schemas[tool.slug] = strict.source
        wrapped["parameters"] = strict.schema
        wrapped["strict"] = True
        return wrapped

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
        strict_schema = self._strict_input_schemas.get(slug)
        if strict_schema is not None:
            # Under strict mode optional parameters are emitted as
            # required-nullable, so a ``null`` the tool's own schema does not
            # accept means "omitted".
            arguments = omit_null_tool_arguments(arguments, strict_schema)

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
