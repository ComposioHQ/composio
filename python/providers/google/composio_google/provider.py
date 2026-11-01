"""
Google AI Python Gemini tool spec.
"""

import typing as t

from proto.marshal.collections.maps import MapComposite
from vertexai.generative_models import (
    Content,
    FunctionDeclaration,
    GenerationResponse,
    Part,
)

from composio.core.provider import NonAgenticProvider, ToolCallSession
from composio.types import Modifiers, Tool, ToolExecutionResponse
from composio.utils.json_schema import dereference_json_schema
from composio.utils.shared import normalize_tool_arguments


def _convert_map_composite(obj):
    if isinstance(obj, MapComposite):
        return {k: _convert_map_composite(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_convert_map_composite(item) for item in obj]
    return obj


class GoogleProvider(
    NonAgenticProvider[FunctionDeclaration, list[FunctionDeclaration]],
    name="google",
):
    """
    Composio toolset for Google AI Python Gemini framework.
    """

    def wrap_tool(self, tool: Tool) -> FunctionDeclaration:
        """Wraps composio tool as Google AI Python Gemini FunctionDeclaration object."""
        input_parameters = dereference_json_schema(
            tool.input_parameters,
            on_unresolved="sentinel",
        )
        # Clean up properties by removing 'examples' field
        properties = t.cast(
            dict[str, dict],
            input_parameters.get("properties", {}),
        )
        cleaned_properties = {
            prop_name: {k: v for k, v in prop_schema.items() if k != "examples"}
            for prop_name, prop_schema in properties.items()
        }
        return FunctionDeclaration(
            name=tool.slug,
            description=tool.description,
            parameters={
                "type": "object",
                "properties": cleaned_properties,
                "required": input_parameters.get("required", []),
            },
        )

    def wrap_tools(self, tools: t.Sequence[Tool]) -> list[FunctionDeclaration]:
        return [self.wrap_tool(tool) for tool in tools]

    @t.overload
    def execute_tool_call(
        self,
        user_id: str,
        function_call: t.Any,
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse: ...

    @t.overload
    def execute_tool_call(
        self,
        *,
        session: ToolCallSession,
        function_call: t.Any,
    ) -> ToolExecutionResponse: ...

    def execute_tool_call(
        self,
        user_id: t.Optional[str] = None,
        function_call: t.Any = None,
        modifiers: t.Optional[Modifiers] = None,
        *,
        session: t.Optional[ToolCallSession] = None,
    ) -> ToolExecutionResponse:
        """
        Execute a function call.

        :param function_call: Function call metadata from Gemini model response.
        :param user_id: User ID for direct tool execution.
        :param session: Tool Router session that produced session tools.
        :param modifiers: Modifiers to use for direct execution.
        :return: Object containing output data from the function call.
        """
        if function_call is None:
            raise TypeError("function_call is required")
        # Gemini returns args as a MapComposite; normalize after converting to a
        # plain dict so a stringified payload is handled uniformly too (issue #2406).
        arguments = normalize_tool_arguments(_convert_map_composite(function_call.args))
        return self.execute_tool_for_target(
            target=self.resolve_tool_call_execution_target(
                user_id=user_id, session=session
            ),
            slug=function_call.name,
            arguments=arguments,
            modifiers=modifiers,
        )

    @t.overload
    def handle_response(
        self,
        user_id: str,
        response: GenerationResponse,
        modifiers: t.Optional[Modifiers] = None,
    ) -> t.List[ToolExecutionResponse]: ...

    @t.overload
    def handle_response(
        self,
        *,
        session: ToolCallSession,
        response: GenerationResponse,
    ) -> t.List[ToolExecutionResponse]: ...

    def handle_response(
        self,
        user_id: t.Optional[str] = None,
        response: t.Optional[GenerationResponse] = None,
        modifiers: t.Optional[Modifiers] = None,
        *,
        session: t.Optional[ToolCallSession] = None,
    ) -> t.List[ToolExecutionResponse]:
        """
        Handle response from Google AI Python Gemini model.

        :param response: Generation response from the Gemini model.
        :param user_id: User ID for direct tool execution.
        :param session: Tool Router session that produced session tools.
        :param modifiers: Modifiers to use for direct execution.
        :return: A list of output objects from the function calls.
        """
        if response is None:
            raise TypeError("response is required")
        self.resolve_tool_call_execution_target(user_id=user_id, session=session)
        if session is not None and modifiers is not None:
            raise ValueError(
                "Direct execution modifiers cannot be used with a Tool Router session"
            )
        outputs = []
        for candidate in response.candidates:
            if isinstance(candidate.content, Content) and candidate.content.parts:
                for part in candidate.content.parts:
                    if isinstance(part, Part) and part.function_call:
                        outputs.append(
                            self.execute_tool_call(
                                session=session,
                                function_call=part.function_call,
                            )
                            if session is not None
                            else self.execute_tool_call(
                                user_id=t.cast(str, user_id),
                                function_call=part.function_call,
                                modifiers=modifiers,
                            )
                        )
        return outputs
