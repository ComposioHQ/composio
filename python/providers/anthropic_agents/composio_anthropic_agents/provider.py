"""
Anthropic Agents provider implementation for Composio.
"""

from __future__ import annotations

import asyncio
import json
import typing as t

import pydantic
from claude_agent_sdk import SdkMcpTool

from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool, ToolExecutionResponse
from composio.utils.pydantic import parse_pydantic_error

_ToolHandlerInput = t.Dict[str, t.Any]
_ToolHandlerOutput = t.Dict[str, t.Any]


class AnthropicAgentsProvider(
    AgenticProvider[SdkMcpTool[_ToolHandlerInput], list[SdkMcpTool[_ToolHandlerInput]]],
    name="anthropic_agents",
):
    """
    Composio toolset adapter for the Claude Agents SDK.
    """

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> SdkMcpTool[_ToolHandlerInput]:
        """
        Wrap a Composio tool as a Claude SDK MCP tool.
        """

        input_schema = (
            tool.input_parameters.copy()
            if tool.input_parameters is not None
            else {"type": "object", "properties": {}}
        )

        async def handler(arguments: _ToolHandlerInput) -> _ToolHandlerOutput:
            """
            Execute a Composio action when Claude invokes the MCP tool.
            """
            try:
                response = t.cast(
                    ToolExecutionResponse,
                    await asyncio.to_thread(
                        execute_tool,
                        slug=tool.slug,
                        arguments=arguments,
                    ),
                )
            except pydantic.ValidationError as exc:
                error_text = parse_pydantic_error(exc)
                return {
                    "content": [{"type": "text", "text": error_text}],
                    "is_error": True,
                }
            except Exception as exc:  # pragma: no cover - defensive guard
                return {
                    "content": [{"type": "text", "text": str(exc)}],
                    "is_error": True,
                }

            # Convert the Composio response into Claude-friendly text blocks.
            if response["successful"]:
                text = json.dumps(response["data"], default=str)
                result: _ToolHandlerOutput = {
                    "content": [{"type": "text", "text": text}],
                }
            else:
                error_text = response.get("error") or "Tool execution failed."
                result = {
                    "content": [{"type": "text", "text": error_text}],
                    "is_error": True,
                }

            return result

        return SdkMcpTool(
            name=tool.slug,
            description=tool.description or "",
            input_schema=t.cast(dict[str, t.Any], input_schema),
            handler=handler,
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[SdkMcpTool[_ToolHandlerInput]]:
        """
        Wrap all provided tools for consumption inside Claude Agents.
        """
        return [self.wrap_tool(tool, execute_tool) for tool in tools]

