"""ComposioLangChain class definition"""

import types
import typing as t
from inspect import Signature

from llama_index.core.tools import FunctionTool

from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.shared import (
    get_signature_format_from_schema_params,
    normalize_tool_arguments,
    reinstate_reserved_python_keywords,
    substitute_reserved_python_keywords,
)


class LlamaIndexProvider(
    AgenticProvider[FunctionTool, t.List[FunctionTool]],
    name="llamaindex",
):
    """
    Composio toolset for LlamaIndex framework.
    """

    async_tool_execution = "native"

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> FunctionTool:
        """
        Wrap a tool into a LlamaIndex FunctionTool object.
        """
        schema_params, keywords = substitute_reserved_python_keywords(
            schema=tool.input_parameters
        )

        def function(**kwargs: t.Any) -> t.Dict:
            """Wrapper function for composio action."""
            kwargs = reinstate_reserved_python_keywords(
                request=kwargs, keywords=keywords
            )
            # Normalize defensively so a stringified payload is coerced to a dict (issue #2406).
            return execute_tool(
                slug=tool.slug, arguments=normalize_tool_arguments(kwargs)
            )

        action_func = types.FunctionType(
            function.__code__,
            globals=globals(),
            name=tool.slug,
            closure=function.__closure__,
        )
        action_func.__signature__ = Signature(  # type: ignore
            parameters=get_signature_format_from_schema_params(
                schema_params=schema_params,
                skip_default=self.skip_default,
            )
        )
        action_func.__doc__ = tool.description
        async_execute = getattr(type(execute_tool), "aexecute", None)

        async def async_action(**kwargs: t.Any) -> t.Dict:
            assert async_execute is not None
            arguments = reinstate_reserved_python_keywords(
                request=kwargs, keywords=keywords
            )
            return await async_execute(
                execute_tool, tool.slug, normalize_tool_arguments(arguments)
            )

        return FunctionTool.from_defaults(
            action_func,
            async_fn=async_action if async_execute is not None else None,
            name=tool.slug,
            description=tool.description,
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> t.List[FunctionTool]:
        """
        Wrap tools into LlamaIndex FunctionTool objects.
        """
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
