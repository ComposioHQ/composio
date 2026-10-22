import asyncio
import functools
import hashlib
import logging
import types
import typing as t
from inspect import Signature

import pydantic
from autogen.agentchat.conversable_agent import ConversableAgent
from autogen.runtime_logging import log_function_use, logging_enabled
from autogen.tools import serialize_to_str
from autogen_core import EVENT_LOGGER_NAME, CancellationToken, trace_tool_span
from autogen_core.logging import ToolCallEvent
from autogen_core.tools import FunctionTool, ToolSchema

from composio.client.types import Tool
from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.schema_converter import object_is_open
from composio.utils.shared import (
    alias_tool_input_schema,
    get_signature_format_from_schema_params,
    json_schema_to_model,
    normalize_tool_arguments,
    validate_and_serialize_tool_arguments,
)

_event_logger = logging.getLogger(EVENT_LOGGER_NAME)


class ComposioFunctionTool(FunctionTool):
    """A ``FunctionTool`` that runs a Composio tool on the model's raw arguments.

    ``FunctionTool.run_json`` validates the arguments against a model built
    from the function signature, which drops every key the signature does not
    name and fills omitted ones with fallback defaults. This tool hands the
    raw mapping to the wrapped function instead, which validates it against
    the source schema, and advertises the source root's openness so the model
    can send the keys that schema admits.
    """

    def __init__(
        self,
        func: t.Callable[..., t.Any],
        description: str,
        name: str,
        root_schema: t.Dict[str, t.Any],
    ) -> None:
        super().__init__(func=func, description=description, name=name)
        self._root_schema = root_schema

    @property
    def schema(self) -> ToolSchema:
        schema = super().schema
        parameters = t.cast(t.Dict[str, t.Any], schema["parameters"])
        root = self._root_schema
        parameters["additionalProperties"] = root.get(
            "additionalProperties", object_is_open(root)
        )
        if "patternProperties" in root:
            parameters["patternProperties"] = root["patternProperties"]
        return schema

    async def run_json(
        self,
        args: t.Mapping[str, t.Any],
        cancellation_token: CancellationToken,
        call_id: t.Optional[str] = None,
    ) -> t.Any:
        arguments = normalize_tool_arguments(args)
        # Same span and event as `BaseTool.run_json`, which this does not call
        # because it re-runs the signature model that drops keys.
        with trace_tool_span(
            tool_name=self._name,
            tool_description=self._description,
            tool_call_id=call_id,
        ):
            future = asyncio.get_running_loop().run_in_executor(
                None, functools.partial(self._func, **arguments)
            )
            cancellation_token.link_future(future)
            result = await future
        _event_logger.info(
            ToolCallEvent(
                tool_name=self.name,
                arguments=arguments,
                result=self.return_value_as_string(result),
            )
        )
        return result


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
            # The model-facing declaration is derived from the function signature.
            caller.register_for_llm(name=tool.name, description=tool.description)(
                tool._func
            )
            # Execution bypasses AG2's signature-based parameter injection,
            # which drops keys the signature does not name, so the wrapped
            # function validates the model's raw arguments itself.
            executor.register_function({tool.name: self._ag2_executor(executor, tool)})

    @staticmethod
    def _ag2_executor(
        executor: ConversableAgent, tool: FunctionTool
    ) -> t.Callable[..., str]:
        func = tool._func

        def execute(**arguments: t.Any) -> str:
            result = func(**arguments)
            if logging_enabled():
                log_function_use(executor, func, arguments, result)
            return serialize_to_str(result)

        return execute

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> FunctionTool:
        """Wraps a composio tool as an Autogen FunctionTool."""
        aliases = alias_tool_input_schema(schema=tool.input_parameters)
        args_schema = json_schema_to_model(
            aliases.schema, skip_default=self.skip_default
        )

        def execute_action(**kwargs: t.Any) -> t.Dict:
            """Validate the model's arguments and execute the tool."""
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

        # Create function with proper signature
        function = types.FunctionType(
            code=execute_action.__code__,
            globals=globals(),
            closure=execute_action.__closure__,
            name=self._process_function_name_for_registration(input_string=tool.slug),
        )

        # The signature only declares the tool; `execute_action` accepts any
        # keys and validates them against the source schema.
        params = get_signature_format_from_schema_params(
            schema_params=aliases.schema,
            skip_default=self.skip_default,
        )
        function.__doc__ = tool.description
        setattr(function, "__signature__", Signature(parameters=params))
        setattr(
            function,
            "__annotations__",
            {p.name: p.annotation for p in params} | {"return": t.Dict[str, t.Any]},
        )
        return ComposioFunctionTool(
            func=function,
            description=tool.description,
            name=self._process_function_name_for_registration(input_string=tool.slug),
            root_schema=aliases.schema,
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[FunctionTool]:
        """Wraps array of composio tools as an Autogen FunctionTool."""
        return [self.wrap_tool(tool=tool, execute_tool=execute_tool) for tool in tools]
