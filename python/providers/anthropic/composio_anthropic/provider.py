import typing as t

from anthropic.types.beta.beta_tool_use_block import BetaToolUseBlock
from anthropic.types.message import Message as ToolsBetaMessage
from anthropic.types.tool_param import ToolParam
from anthropic.types.tool_use_block import ToolUseBlock

from composio.core.provider import NonAgenticProvider, ToolCallSession
from composio.types import Modifiers, Tool, ToolExecutionResponse
from composio.utils.shared import (
    ToolSchemaAliases,
    alias_tool_input_schema,
    normalize_tool_arguments,
)


class AnthropicProvider(
    NonAgenticProvider[ToolParam, list[ToolParam]],
    name="anthropic",
):
    """
    Composio toolset for Anthropic Claude platform.
    """

    def __init__(self, **kwargs: t.Any) -> None:
        super().__init__(**kwargs)
        self._aliases: dict[str, ToolSchemaAliases] = {}

    def wrap_tool(self, tool: Tool) -> ToolParam:
        aliases = alias_tool_input_schema(tool.input_parameters or {})
        self._aliases[tool.slug] = aliases
        return ToolParam(
            input_schema=aliases.schema,
            name=tool.slug,
            description=tool.description,
        )

    def wrap_tools(self, tools: t.Sequence[Tool]) -> list[ToolParam]:
        return [self.wrap_tool(tool) for tool in tools]

    @t.overload
    def execute_tool_call(
        self,
        user_id: str,
        tool_call: ToolUseBlock,
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse: ...

    @t.overload
    def execute_tool_call(
        self,
        *,
        session: ToolCallSession,
        tool_call: ToolUseBlock,
    ) -> ToolExecutionResponse: ...

    def execute_tool_call(
        self,
        user_id: t.Optional[str] = None,
        tool_call: t.Optional[ToolUseBlock] = None,
        modifiers: t.Optional[Modifiers] = None,
        *,
        session: t.Optional[ToolCallSession] = None,
    ) -> ToolExecutionResponse:
        """
        Execute a tool call.

        :param user_id: User ID for direct tool execution.
        :param session: Tool Router session that produced session tools.
        :param tool_call: Tool call metadata.
        :param modifiers: Modifiers to use for executing function calls.
        :return: Object containing output data from the tool call.
        """
        if tool_call is None:
            raise TypeError("tool_call is required")
        target = self.resolve_tool_call_execution_target(
            user_id=user_id, session=session
        )

        # Models occasionally emit tool input as a JSON string rather than a dict (issue #2406).
        arguments = normalize_tool_arguments(tool_call.input)
        aliases = self._aliases.get(tool_call.name)
        if aliases is not None:
            arguments = aliases.restore_arguments(arguments)
        return self.execute_tool_for_target(
            target=target,
            slug=tool_call.name,
            arguments=arguments,
            modifiers=modifiers,
        )

    @t.overload
    def handle_tool_calls(
        self,
        user_id: str,
        response: t.Union[dict, ToolsBetaMessage],
        modifiers: t.Optional[Modifiers] = None,
    ) -> t.List[ToolExecutionResponse]: ...

    @t.overload
    def handle_tool_calls(
        self,
        *,
        session: ToolCallSession,
        response: t.Union[dict, ToolsBetaMessage],
    ) -> t.List[ToolExecutionResponse]: ...

    def handle_tool_calls(
        self,
        user_id: t.Optional[str] = None,
        response: t.Optional[t.Union[dict, ToolsBetaMessage]] = None,
        modifiers: t.Optional[Modifiers] = None,
        *,
        session: t.Optional[ToolCallSession] = None,
    ) -> t.List[ToolExecutionResponse]:
        """
        Handle tool calls from Anthropic Claude chat completion object.

        :param response: Chat completion object from
            `anthropic.Anthropic.beta.tools.messages.create` function call.
        :param user_id: User ID for direct tool execution.
        :param session: Tool Router session that produced session tools.
        :param modifiers: Modifiers to use for executing function calls.
        :return: A list of output objects from the tool calls.
        """
        if response is None:
            raise TypeError("response is required")
        self.resolve_tool_call_execution_target(user_id=user_id, session=session)
        if session is not None and modifiers is not None:
            raise ValueError(
                "Direct execution modifiers cannot be used with a Tool Router session"
            )
        if isinstance(response, dict):
            response = ToolsBetaMessage(**response)

        outputs = []
        for content in response.content:
            if isinstance(content, (ToolUseBlock, BetaToolUseBlock)):
                result = (
                    self.execute_tool_call(
                        session=session,
                        tool_call=content,
                    )
                    if session is not None
                    else self.execute_tool_call(
                        user_id=t.cast(str, user_id),
                        tool_call=content,
                        modifiers=modifiers,
                    )
                )
                outputs.append(result)
        return outputs
