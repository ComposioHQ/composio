import hashlib
import types
import typing as t
from inspect import Signature

import autogen
from autogen.agentchat.conversable_agent import ConversableAgent
from autogen_core.tools import FunctionTool

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.utils.shared import get_signature_format_from_schema_params


class AutogenProvider(
    AgenticProvider[FunctionTool, list[FunctionTool]],
    name="autogen",
):
    """
    Composio toolset for Autogen framework.
    """

    def _process_function_name_for_registration(
        self,
        input_string: str,
        max_allowed_length: int = 64,
        num_hash_char: int = 10,
    ):
        """
        Process function name for proxy registration under given character length limitation.
        """
        hash_hex = hashlib.sha256(input_string.encode(encoding="utf-8")).hexdigest()
        hash_chars_to_attach = hash_hex[:10]
        num_input_str_char = max_allowed_length - (num_hash_char + 1)
        input_str_to_attach = input_string[-num_input_str_char:]
        processed_name = input_str_to_attach + "_" + hash_chars_to_attach
        return processed_name

    def register_tools(
        self,
        caller: ConversableAgent,
        executor: ConversableAgent,
        tools: t.List[FunctionTool],
    ) -> None:
        """
        Register tools to the proxy agents.

        :param executor: Executor agent.
        :param caller: Caller agent.
        :param tools: List of tools to register.
        """
        for tool in tools:
            autogen.agentchat.register_function(
                f=tool._func,
                caller=caller,
                executor=executor,
                name=tool.name,
                description=tool.description,
            )

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> FunctionTool:
        """Wraps a composio tool as an Autogen FunctionTool."""

        def execute_action(**kwargs: t.Any) -> t.Dict:
            """Placeholder function for executing action."""
            return execute_tool(slug=tool.slug, arguments=kwargs)

        # Create function with proper signature
        function = types.FunctionType(
            code=execute_action.__code__,
            globals=globals(),
            closure=execute_action.__closure__,
            name=self._process_function_name_for_registration(input_string=tool.slug),
        )

        # Set signature and annotations
        params = get_signature_format_from_schema_params(
            schema_params=tool.input_parameters,
        )
        function.__doc__ = tool.description
        setattr(function, "__signature__", Signature(parameters=params))
        setattr(
            function,
            "__annotations__",
            {p.name: p.annotation for p in params} | {"return": t.Dict[str, t.Any]},
        )
        return FunctionTool(
            func=function,
            description=tool.description,
            name=self._process_function_name_for_registration(input_string=tool.slug),
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[FunctionTool]:
        """Wraps array of composio tools as an Autogen FunctionTool."""
        return [self.wrap_tool(tool=tool, execute_tool=execute_tool) for tool in tools]
