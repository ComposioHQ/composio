"""ComposioLangChain class definition"""

import types
import typing as t
from inspect import Signature

from llama_index.core.tools import FunctionTool

from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.shared import get_signature_format_from_schema_params


class LlamaIndexProvider(
    AgenticProvider[FunctionTool, t.List[FunctionTool]],
    name="llamaindex",
):
    """
    Composio toolset for LlamaIndex framework.
    """

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> FunctionTool:
        """
        Wrap a tool into a LlamaIndex FunctionTool object.
        """

        def function(**kwargs: t.Any) -> t.Dict:
            """Wrapper function for composio action."""
            return execute_tool(slug=tool.slug, arguments=kwargs)

        action_func = types.FunctionType(
            function.__code__,
            globals=globals(),
            name=tool.slug,
            closure=function.__closure__,
        )
        action_func.__signature__ = Signature(  # type: ignore
            parameters=get_signature_format_from_schema_params(
                schema_params=tool.input_parameters,
                skip_default=self.skip_default,
            )
        )
        action_func.__doc__ = tool.description
        return FunctionTool.from_defaults(
            action_func,
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
