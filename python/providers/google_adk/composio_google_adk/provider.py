import types
import typing as t
from inspect import Signature

import pydantic
from google.adk.tools import FunctionTool

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.utils.openapi import function_signature_from_jsonschema
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import (
    alias_tool_input_schema,
    json_schema_to_model,
    normalize_tool_arguments,
    validate_and_serialize_tool_arguments,
)

if t.TYPE_CHECKING:
    from google.adk.tools.tool_context import ToolContext


class _ComposioFunctionTool(FunctionTool):
    """`FunctionTool` that hands the wrapped function every root argument.

    ADK keeps only the arguments named in the function signature, so root keys
    the tool schema admits through `additionalProperties` or
    `patternProperties` never reach the function. The function body validates
    the full mapping against the tool schema instead.

    ADK reserves its context parameter and `input_stream` for objects it
    injects. Those names are never forwarded: neither a value the model sent
    under them nor ADK's own objects reach the tool backend.
    """

    def _prepare_invocation_args(
        self,
        args: t.Dict[str, t.Any],
        tool_context: "ToolContext",
    ) -> t.Dict[str, t.Any]:
        prepared = super()._prepare_invocation_args(args, tool_context)
        reserved = getattr(self, "_ignore_params", ("tool_context", "input_stream"))
        return {
            key: value
            for key, value in {**args, **prepared}.items()
            if key not in reserved
        }


class GoogleAdkProvider(
    AgenticProvider[FunctionTool, list[FunctionTool]], name="google_adk"
):
    """
    Composio toolset for Google ADK framework.
    """

    __schema_skip_defaults__ = True

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> FunctionTool:
        """Wraps composio tool as Google Genai SDK compatible function calling object."""

        input_parameters = t.cast(
            t.Dict[str, t.Any],
            tool.input_parameters
            or {
                "type": "object",
                "properties": {},
                "required": [],
            },
        )
        aliases = alias_tool_input_schema(schema=input_parameters)
        properties = t.cast(
            t.Dict[str, t.Dict[str, t.Any]],
            aliases.schema.get("properties", {}),
        )
        docstring = tool.description or f"Execute {tool.slug}"
        docstring += "\nArgs:"
        for _param, _schema in properties.items():
            docstring += "\n    "
            docstring += _param + ": " + _schema.get("description", _param.title())

        docstring += "\nReturns:"
        docstring += "\n    A dictionary containing response from the action"

        # ADK treats every signature parameter as mandatory, so the model
        # requires every declared field too.
        args_schema = json_schema_to_model(
            aliases.schema, skip_default=self.skip_default
        )

        def _execute(**kwargs: t.Any) -> t.Dict:
            try:
                arguments = validate_and_serialize_tool_arguments(
                    args_schema, normalize_tool_arguments(kwargs)
                )
            except pydantic.ValidationError as e:
                return {
                    "successful": False,
                    "error": parse_pydantic_error(e),
                    "data": None,
                }
            return execute_tool(
                slug=tool.slug, arguments=aliases.restore_arguments(arguments)
            )

        function = types.FunctionType(
            code=_execute.__code__,
            name=tool.slug,
            globals=globals(),
            closure=_execute.__closure__,
        )
        parameters = function_signature_from_jsonschema(
            schema=aliases.schema,
            skip_default=self.skip_default,
        )
        setattr(function, "__signature__", Signature(parameters=parameters))
        setattr(
            function,
            "__annotations__",
            {p.name: p.annotation for p in parameters} | {"return": dict},
        )
        function.__doc__ = docstring
        return _ComposioFunctionTool(function)

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[FunctionTool]:
        """Get composio tools wrapped as Google Genai SDK compatible function calling object."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
