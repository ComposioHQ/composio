import types
import typing as t
from inspect import Signature

from google.adk.tools import FunctionTool

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.utils.openapi import function_signature_from_jsonschema
from composio.utils.shared import normalize_tool_arguments


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
        properties = t.cast(
            t.Dict[str, t.Dict[str, t.Any]],
            input_parameters.get("properties", {}),
        )
        docstring = tool.description or f"Execute {tool.slug}"
        docstring += "\nArgs:"
        for _param, _schema in properties.items():
            docstring += "\n    "
            docstring += _param + ": " + _schema.get("description", _param.title())

        docstring += "\nReturns:"
        docstring += "\n    A dictionary containing response from the action"

        def _execute(**kwargs: t.Any) -> t.Dict:
            # Normalize defensively so a stringified payload is coerced to a dict (issue #2406).
            return execute_tool(
                slug=tool.slug, arguments=normalize_tool_arguments(kwargs)
            )

        function = types.FunctionType(
            code=_execute.__code__,
            name=tool.slug,
            globals=globals(),
            closure=_execute.__closure__,
        )
        parameters = function_signature_from_jsonschema(
            schema=input_parameters,
            skip_default=self.skip_default,
        )
        setattr(function, "__signature__", Signature(parameters=parameters))
        setattr(
            function,
            "__annotations__",
            {p.name: p.annotation for p in parameters} | {"return": dict},
        )
        function.__doc__ = docstring
        return FunctionTool(function)

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[FunctionTool]:
        """Get composio tools wrapped as Google Genai SDK compatible function calling object."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
