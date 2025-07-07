import types
import typing as t
from inspect import Signature

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.utils.openapi import function_signature_from_jsonschema


class GeminiProvider(AgenticProvider[t.Callable, list[t.Callable]], name="gemini"):
    """
    Composio toolset for Google AI Python Gemini framework.
    """

    __schema_skip_defaults__ = True

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> t.Callable:
        """Wraps composio tool as Google Genai SDK compatible function calling object."""

        docstring = tool.description
        docstring += "\nArgs:"
        for _param, _schema in tool.input_parameters["properties"].items():  # type: ignore
            docstring += "\n    "
            docstring += _param + ": " + _schema.get("description", _param.title())

        docstring += "\nReturns:"
        docstring += "\n    A dictionary containing response from the action"

        def _execute(**kwargs: t.Any) -> t.Dict:
            return execute_tool(slug=tool.slug, arguments=kwargs)

        function = types.FunctionType(
            code=_execute.__code__,
            name=tool.slug,
            globals=globals(),
            closure=_execute.__closure__,
        )
        parameters = function_signature_from_jsonschema(
            schema=tool.input_parameters,
            skip_default=self.skip_default,
        )
        setattr(function, "__signature__", Signature(parameters=parameters))
        setattr(
            function,
            "__annotations__",
            {p.name: p.annotation for p in parameters} | {"return": dict},
        )
        function.__doc__ = docstring
        return function

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[t.Callable]:
        """Get composio tools wrapped as Google Genai SDK compatible function calling object."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
