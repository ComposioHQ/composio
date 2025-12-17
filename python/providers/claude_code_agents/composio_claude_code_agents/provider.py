"""
Claude Code Agents Provider for Composio

This provider enables integration with Claude Code Agents SDK,
allowing Composio tools to be used as MCP tools within Claude agents.
"""

import asyncio
import json
import typing as t

from claude_agent_sdk import (
    McpSdkServerConfig,
    SdkMcpTool,
    create_sdk_mcp_server,
    tool as sdk_tool,
)

from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.types import Tool


class ClaudeCodeAgentsProvider(
    AgenticProvider[SdkMcpTool, list[SdkMcpTool]],
    name="claude_code_agents",
):
    """
    Composio toolset for Claude Code Agents SDK.

    This provider wraps Composio tools as MCP tools that can be used with
    the Claude Agent SDK's `query()` function via the `mcp_servers` option.

    Example:
        ```python
        import asyncio
        from composio import Composio
        from composio_claude_code_agents import ClaudeCodeAgentsProvider
        from claude_agent_sdk import query, ClaudeAgentOptions

        composio = Composio(provider=ClaudeCodeAgentsProvider())

        async def main():
            tools = composio.tools.get(user_id="default", toolkits=["gmail"])
            mcp_server = composio.provider.create_mcp_server(tools)

            async for message in query(
                prompt="Fetch my latest email",
                options=ClaudeAgentOptions(
                    mcp_servers={"composio": mcp_server},
                    permission_mode="bypassPermissions",
                ),
            ):
                print(message)

        asyncio.run(main())
        ```
    """

    def __init__(
        self,
        server_name: str = "composio",
        server_version: str = "1.0.0",
    ) -> None:
        """
        Initialize the Claude Code Agents provider.

        Args:
            server_name: Name for the MCP server (default: "composio")
            server_version: Version for the MCP server (default: "1.0.0")
        """
        super().__init__()
        self.server_name = server_name
        self.server_version = server_version

    def _json_schema_to_simple_schema(
        self, json_schema: t.Dict[str, t.Any]
    ) -> t.Dict[str, t.Any]:
        """
        Convert JSON Schema to simple type mapping for Claude Agent SDK.

        The Claude Agent SDK accepts either:
        1. Simple type mapping: {"text": str, "count": int}
        2. Full JSON Schema format

        We use the JSON Schema format directly since it supports more complex validation.

        Args:
            json_schema: The JSON Schema to convert

        Returns:
            A schema compatible with Claude Agent SDK's tool() decorator
        """
        return json_schema

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> SdkMcpTool:
        """
        Wrap a Composio tool as a Claude Agent SDK MCP tool.

        Args:
            tool: The Composio tool to wrap
            execute_tool: Function to execute the tool

        Returns:
            A Claude Agent SDK MCP tool definition
        """
        input_schema = self._json_schema_to_simple_schema(tool.input_parameters or {})

        @sdk_tool(
            tool.slug,
            tool.description or f"Execute {tool.slug}",
            input_schema,
        )
        async def tool_handler(args: t.Dict[str, t.Any]) -> t.Dict[str, t.Any]:
            """Execute the Composio tool with the given arguments."""
            try:
                # Run the synchronous execute_tool in a thread
                result = await asyncio.to_thread(
                    execute_tool,
                    tool.slug,
                    args,
                )
                # Format the result for Claude Agent SDK
                result_text = result if isinstance(result, str) else json.dumps(result)
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": result_text,
                        }
                    ]
                }
            except Exception as e:
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(
                                {
                                    "successful": False,
                                    "error": str(e),
                                    "data": None,
                                }
                            ),
                        }
                    ]
                }

        return tool_handler

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[SdkMcpTool]:
        """
        Wrap multiple Composio tools as Claude Agent SDK MCP tools.

        Args:
            tools: Sequence of Composio tools to wrap
            execute_tool: Function to execute the tools

        Returns:
            List of Claude Agent SDK MCP tool definitions
        """
        return [self.wrap_tool(tool, execute_tool) for tool in tools]

    def create_mcp_server(
        self,
        wrapped_tools: list[SdkMcpTool],
    ) -> McpSdkServerConfig:
        """
        Create an MCP server configuration for use with Claude Agent SDK.

        This is the primary method for integrating Composio tools with Claude agents.
        The returned configuration can be passed directly to the `mcp_servers` option.

        Args:
            wrapped_tools: List of wrapped Claude Agent SDK MCP tools
                          (from composio.tools.get())

        Returns:
            MCP server configuration for Claude Agent SDK

        Example:
            ```python
            tools = composio.tools.get(user_id="default", toolkits=["gmail"])
            mcp_server = composio.provider.create_mcp_server(tools)

            async for message in query(
                prompt="Send an email",
                options=ClaudeAgentOptions(
                    mcp_servers={"composio": mcp_server},
                ),
            ):
                print(message)
            ```
        """
        return create_sdk_mcp_server(
            name=self.server_name,
            version=self.server_version,
            tools=wrapped_tools,
        )
