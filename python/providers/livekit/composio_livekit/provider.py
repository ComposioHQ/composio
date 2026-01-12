"""
LiveKit Agents Provider for Composio SDK.

To be used with the LiveKit Agents SDK (livekit-agents).

This provider enables integration with LiveKit Agents SDK,
allowing Composio tools to be used as LLM tools within LiveKit voice agents.
"""

from __future__ import annotations

import asyncio
import json
import typing as t

from livekit.agents import function_tool, FunctionTool

from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.types import Tool


LivekitTool: t.TypeAlias = FunctionTool
LivekitToolCollection: t.TypeAlias = t.List[LivekitTool]


def _slug_to_snake_case(slug: str) -> str:
    """
    Convert a SCREAMING_SNAKE_CASE slug to snake_case.
    Example: GMAIL_SEND_EMAIL -> gmail_send_email

    Note: In TypeScript, we use camelCase (gmailSendEmail) to match JS conventions.
    In Python, we use snake_case to match Python conventions.
    """
    return slug.lower()


class LivekitProvider(
    AgenticProvider[LivekitTool, LivekitToolCollection],
    name="livekit",
):
    """
    Composio provider for LiveKit Agents SDK.

    This provider wraps Composio tools as LiveKit Agent tools that can be used
    with the LiveKit Agents SDK's Agent class.

    Example:
        ```python
        from composio import Composio
        from composio_livekit import LivekitProvider
        from livekit.agents import Agent

        composio = Composio(provider=LivekitProvider())

        # Get tools wrapped for LiveKit
        tools = composio.tools.get(
            user_id="default",
            slug=["GMAIL_SEND_EMAIL", "SLACK_POST_MESSAGE"]
        )

        # Use with LiveKit Agent
        class MyAgent(Agent):
            def __init__(self):
                super().__init__(
                    instructions="You are a helpful assistant.",
                    tools=tools,
                )
        ```
    """

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> LivekitTool:
        """
        Wrap a Composio tool as a LiveKit Agent function tool.

        Args:
            tool: The Composio tool to wrap.
            execute_tool: Function to execute the tool.

        Returns:
            A LiveKit Agent FunctionTool definition.
        """
        input_params = tool.input_parameters or {}

        # Build the raw schema for LiveKit's function_tool
        # This is equivalent to TypeScript's llm.tool() with jsonSchemaToZod
        raw_schema = {
            "type": "function",
            "name": _slug_to_snake_case(tool.slug),
            "description": tool.description or f"Execute {tool.slug}",
            "parameters": input_params,
        }

        # Capture tool.slug in closure to avoid late binding issues
        tool_slug = tool.slug

        # Create the async handler that will be called when the tool is invoked
        async def tool_handler(
            raw_arguments: t.Dict[str, t.Any],
            context: t.Any,  # RunContext from livekit.agents
        ) -> str:
            """Execute the Composio tool with the provided arguments."""
            try:
                # Run sync execute_tool in thread pool to avoid blocking the event loop
                result = await asyncio.to_thread(
                    execute_tool,
                    slug=tool_slug,
                    arguments=raw_arguments,
                )
                # Return string as-is, otherwise JSON stringify (matches TS behavior)
                return result if isinstance(result, str) else json.dumps(result)
            except Exception as e:
                # Return error in standard Composio format (matches TS behavior)
                return json.dumps(
                    {
                        "successful": False,
                        "error": str(e),
                        "data": None,
                    }
                )

        # Use function_tool as a function (not decorator) with raw_schema
        return function_tool(tool_handler, raw_schema=raw_schema)

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> LivekitToolCollection:
        """
        Wrap multiple Composio tools as LiveKit Agent function tools.

        Args:
            tools: Sequence of Composio tools to wrap.
            execute_tool: Function to execute the tools.

        Returns:
            List of LiveKit Agent FunctionTool definitions.
        """
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
