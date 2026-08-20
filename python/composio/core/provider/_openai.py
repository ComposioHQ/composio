"""
OpenAI provider implementation.
"""

from __future__ import annotations

import json
import time
import typing as t

from openai import Client
from openai.types.beta.thread import Thread
from openai.types.beta.threads.run import Run
from openai.types.chat.chat_completion import ChatCompletion
from openai.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
)
from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam
from openai.types.shared_params.function_definition import FunctionDefinition
from openai.types.shared_params.function_parameters import FunctionParameters

from composio.core.provider import NonAgenticProvider, ToolCallSession
from composio.types import Modifiers, Tool, ToolExecutionResponse
from composio.utils.shared import normalize_tool_arguments

OpenAITool: t.TypeAlias = ChatCompletionToolParam
OpenAIToolCollection: t.TypeAlias = t.List[OpenAITool]


class OpenAIProvider(
    NonAgenticProvider[OpenAITool, OpenAIToolCollection], name="openai"
):
    """OpenAIProvider class definition"""

    def wrap_tool(self, tool: Tool) -> OpenAITool:
        return ChatCompletionToolParam(
            function=FunctionDefinition(
                name=tool.slug,
                description=tool.description,
                parameters=t.cast(FunctionParameters, tool.input_parameters),
                strict=None,
            ),
            type="function",
        )

    def wrap_tools(self, tools: t.Sequence[Tool]) -> OpenAIToolCollection:
        return [self.wrap_tool(tool) for tool in tools]

    @t.overload
    def execute_tool_call(
        self,
        user_id: str,
        tool_call: ChatCompletionMessageToolCall,
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse: ...

    @t.overload
    def execute_tool_call(
        self,
        *,
        session: ToolCallSession,
        tool_call: ChatCompletionMessageToolCall,
    ) -> ToolExecutionResponse: ...

    def execute_tool_call(
        self,
        user_id: t.Optional[str] = None,
        tool_call: t.Optional[ChatCompletionMessageToolCall] = None,
        modifiers: t.Optional[Modifiers] = None,
        *,
        session: t.Optional[ToolCallSession] = None,
    ) -> ToolExecutionResponse:
        """Execute a tool call.

        :param tool_call: Tool call metadata.
        :param user_id: User ID for direct tool execution.
        :param session: Tool Router session that produced session tools.
        :return: Object containing output data from the tool call.
        """
        if tool_call is None:
            raise TypeError("tool_call is required")
        target = self.resolve_tool_call_execution_target(
            user_id=user_id, session=session
        )

        # OpenAI always serializes tool arguments as a JSON string; normalize
        # tolerates empty / object-shaped payloads too (issue #2406).
        return self.execute_tool_for_target(
            target=target,
            slug=tool_call.function.name,
            arguments=normalize_tool_arguments(tool_call.function.arguments),
            modifiers=modifiers,
        )

    @t.overload
    def handle_tool_calls(
        self,
        user_id: str,
        response: ChatCompletion,
        modifiers: t.Optional[Modifiers] = None,
    ) -> t.List[ToolExecutionResponse]: ...

    @t.overload
    def handle_tool_calls(
        self,
        *,
        session: ToolCallSession,
        response: ChatCompletion,
    ) -> t.List[ToolExecutionResponse]: ...

    def handle_tool_calls(
        self,
        user_id: t.Optional[str] = None,
        response: t.Optional[ChatCompletion] = None,
        modifiers: t.Optional[Modifiers] = None,
        *,
        session: t.Optional[ToolCallSession] = None,
    ) -> t.List[ToolExecutionResponse]:
        """
        Handle tool calls from OpenAI chat completion object.

        :param response: Chat completion object from
                        openai.OpenAI.chat.completions.create function call
        :param user_id: User ID for direct tool execution.
        :param session: Tool Router session that produced session tools.
        :return: A list of output objects from the function calls.
        """
        if response is None:
            raise TypeError("response is required")
        self.resolve_tool_call_execution_target(user_id=user_id, session=session)
        if session is not None and modifiers is not None:
            raise ValueError(
                "Direct execution modifiers cannot be used with a Tool Router session"
            )
        outputs = []
        # Only the first choice is actionable: its tool results feed back into a
        # single assistant turn. With n > 1, iterating every choice would run each
        # tool call once per choice and orphan the tool_call_ids belonging to the
        # alternative completions.
        choice = response.choices[0] if response.choices else None
        # A single assistant message can carry several tool calls (parallel tool
        # calls, on by default); each one needs its own tool result.
        if choice is not None and choice.message.tool_calls is not None:
            for tool_call in choice.message.tool_calls:
                call = t.cast(ChatCompletionMessageToolCall, tool_call)
                result = (
                    self.execute_tool_call(
                        session=session,
                        tool_call=call,
                    )
                    if session is not None
                    else self.execute_tool_call(
                        user_id=t.cast(str, user_id),
                        tool_call=call,
                        modifiers=modifiers,
                    )
                )
                outputs.append(result)
        return outputs

    def handle_assistant_tool_calls(
        self,
        user_id: str,
        run: Run,
    ) -> t.List:
        """Wait and handle assistant function calls"""
        tool_outputs: list[dict] = []
        if run.required_action is None:
            return tool_outputs

        for tool_call in run.required_action.submit_tool_outputs.tool_calls:
            tool_outputs.append(
                {
                    "tool_call_id": tool_call.id,
                    "output": json.dumps(
                        self.execute_tool_call(
                            tool_call=t.cast(ChatCompletionMessageToolCall, tool_call),
                            user_id=user_id,
                        )
                    ),
                }
            )
        return tool_outputs

    def wait_and_handle_assistant_tool_calls(
        self,
        user_id: str,
        client: Client,
        run: Run,
        thread: Thread,
    ) -> Run:
        """Wait and handle assistant function calls"""
        while run.status in ("queued", "in_progress", "requires_action"):
            if run.status != "requires_action":
                run = client.beta.threads.runs.retrieve(
                    thread_id=thread.id,
                    run_id=run.id,
                )
                time.sleep(0.5)
                continue

            run = client.beta.threads.runs.submit_tool_outputs(
                thread_id=thread.id,
                run_id=run.id,
                tool_outputs=self.handle_assistant_tool_calls(
                    run=run,
                    user_id=user_id,
                ),
            )
        return run
