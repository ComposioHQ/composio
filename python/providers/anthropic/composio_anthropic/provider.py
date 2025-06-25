import typing as t

from anthropic.types.beta.beta_tool_use_block import BetaToolUseBlock
from anthropic.types.message import Message as ToolsBetaMessage
from anthropic.types.tool_param import ToolParam
from anthropic.types.tool_use_block import ToolUseBlock

from composio.core.provider import NonAgenticProvider
from composio.types import Modifiers, Tool, ToolExecutionResponse


class AnthropicProvider(
    NonAgenticProvider[ToolParam, list[ToolParam]],
    name="anthropic",
):
    """
    Composio toolset for Anthropic Claude platform.
    """

    def wrap_tool(self, tool: Tool) -> ToolParam:
        return ToolParam(
            input_schema=tool.input_parameters,
            name=tool.slug,
            description=tool.description,
        )

    def wrap_tools(self, tools: t.Sequence[Tool]) -> list[ToolParam]:
        return [self.wrap_tool(tool) for tool in tools]

    def execute_tool_call(
        self,
        user_id: str,
        tool_call: ToolUseBlock,
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse:
        """
        Execute a tool call.

        :param user_id: User ID to use for executing function calls.
        :param tool_call: Tool call metadata.
        :param modifiers: Modifiers to use for executing function calls.
        :return: Object containing output data from the tool call.
        """
        return self.execute_tool(
            slug=tool_call.name,
            arguments=t.cast(t.Dict, tool_call.input),
            modifiers=modifiers,
            user_id=user_id,
        )

    def handle_tool_calls(
        self,
        user_id: str,
        response: t.Union[dict, ToolsBetaMessage],
        modifiers: t.Optional[Modifiers] = None,
    ) -> t.List[ToolExecutionResponse]:
        """
        Handle tool calls from Anthropic Claude chat completion object.

        :param response: Chat completion object from
            `anthropic.Anthropic.beta.tools.messages.create` function call.
        :param user_id: User ID to use for executing function calls.
        :param modifiers: Modifiers to use for executing function calls.
        :return: A list of output objects from the tool calls.
        """
        if isinstance(response, dict):
            response = ToolsBetaMessage(**response)

        outputs = []
        for content in response.content:
            if isinstance(content, (ToolUseBlock, BetaToolUseBlock)):
                outputs.append(
                    self.execute_tool_call(
                        user_id=user_id,
                        tool_call=content,
                        modifiers=modifiers,
                    )
                )
        return outputs
