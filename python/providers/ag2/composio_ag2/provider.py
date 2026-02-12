import hashlib
import types
import typing as t
from inspect import Signature

import autogen
from autogen.agentchat.conversable_agent import ConversableAgent
from autogen.tools.tool import Tool as FunctionTool

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.utils.shared import get_signature_format_from_schema_params


class AG2Provider(
    AgenticProvider[FunctionTool, list[FunctionTool]],
    name="ag2",
):
    """
    Composio toolset for AG2 framework.
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
            caller.register_for_llm()(tool)
            executor.register_for_execution()(tool)

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> FunctionTool:
        """Wraps a composio tool as an AG2 Tool."""

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
            name=self._process_function_name_for_registration(input_string=tool.slug),
            description=tool.description,
            func_or_tool=function,
            parameters_json_schema=tool.input_parameters,
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[FunctionTool]:
        """Wraps array of composio tools as AG2 Tools."""
        return [self.wrap_tool(tool=tool, execute_tool=execute_tool) for tool in tools]
