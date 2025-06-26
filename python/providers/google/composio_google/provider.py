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

from composio.core.provider import NonAgenticProvider
from composio.types import Modifiers, Tool, ToolExecutionResponse


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
        # Clean up properties by removing 'examples' field
        properties = t.cast(
            dict[str, dict],
            tool.input_parameters.get("properties", {}),
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
                "required": tool.input_parameters.get("required", []),
            },
        )

    def wrap_tools(self, tools: t.Sequence[Tool]) -> list[FunctionDeclaration]:
        return [self.wrap_tool(tool) for tool in tools]

    def execute_tool_call(
        self,
        user_id: str,
        function_call: t.Any,
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse:
        """
        Execute a function call.

        :param function_call: Function call metadata from Gemini model response.
        :param entity_id: Entity ID to use for executing the function call.
        :return: Object containing output data from the function call.
        """
        return self.execute_tool(
            slug=function_call.name,
            arguments=t.cast(
                dict,
                _convert_map_composite(
                    function_call.args,
                ),
            ),
            modifiers=modifiers,
            user_id=user_id,
        )

    def handle_response(
        self,
        user_id: str,
        response: GenerationResponse,
        modifiers: t.Optional[Modifiers] = None,
    ) -> t.List[ToolExecutionResponse]:
        """
        Handle response from Google AI Python Gemini model.

        :param response: Generation response from the Gemini model.
        :param entity_id: Entity ID to use for executing the function call.
        :return: A list of output objects from the function calls.
        """
        outputs = []
        for candidate in response.candidates:
            if isinstance(candidate.content, Content) and candidate.content.parts:
                for part in candidate.content.parts:
                    if isinstance(part, Part) and part.function_call:
                        outputs.append(
                            self.execute_tool_call(
                                user_id=user_id,
                                function_call=part.function_call,
                                modifiers=modifiers,
                            )
                        )
        return outputs
