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

from composio.core.provider import NonAgenticProvider
from composio.types import Modifiers, Tool, ToolExecutionResponse

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

    def execute_tool_call(
        self,
        user_id: str,
        tool_call: ChatCompletionMessageToolCall,
        modifiers: t.Optional[Modifiers] = None,
    ) -> ToolExecutionResponse:
        """Execute a tool call.

        :param tool_call: Tool call metadata.
        :param user_id: User ID to use for executing the function call.
        :return: Object containing output data from the tool call.
        """
        return self.execute_tool(
            slug=tool_call.function.name,
            arguments=json.loads(tool_call.function.arguments),
            modifiers=modifiers,
            user_id=user_id,
        )

    def handle_tool_calls(
        self,
        user_id: str,
        response: ChatCompletion,
        modifiers: t.Optional[Modifiers] = None,
    ) -> t.List[ToolExecutionResponse]:
        """
        Handle tool calls from OpenAI chat completion object.

        :param response: Chat completion object from
                        openai.OpenAI.chat.completions.create function call
        :param entity_id: Entity ID to use for executing the function call.
        :return: A list of output objects from the function calls.
        """
        outputs = []
        for choice in response.choices:
            if choice.message.tool_calls is None:
                continue

            for tool_call in choice.message.tool_calls:
                outputs.append(
                    self.execute_tool_call(
                        user_id=user_id,
                        tool_call=tool_call,
                        modifiers=modifiers,
                    )
                )
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
