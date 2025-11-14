"""
Claude Agent SDK Provider implementation.

This module provides integration between Composio tools and the Claude Agent SDK,
enabling seamless use of Composio actions within Claude Agent applications.
"""

from __future__ import annotations

import typing as t

import pydantic
from claude_agent_sdk import SdkMcpTool, tool

from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.pydantic import parse_pydantic_error


class ClaudeAgentSDKProvider(
    AgenticProvider[SdkMcpTool, t.List[SdkMcpTool]],
    name="claude_agent_sdk",
):
    """
    Composio toolset for Claude Agent SDK framework.

    This provider adapts Composio tools to Claude Agent SDK-compatible tool definitions
    using the @tool decorator pattern. It enables seamless integration of Composio actions
    with Claude Agent SDK applications.

    Example:
        ```python
        from composio import Composio
        from composio_claude_agent import ClaudeAgentSDKProvider
        from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, create_sdk_mcp_server

        # Initialize Composio with Claude Agent SDK provider
        composio = Composio(provider=ClaudeAgentSDKProvider())

        # Get tools
        tools = composio.tools.get(user_id="user123", tools=["GMAIL_GET_PROFILE"])

        # Create MCP server with tools
        mcp_server = create_sdk_mcp_server(
            name="composio_tools",
            version="1.0.0",
            tools=tools,
        )

        # Configure Claude Agent
        options = ClaudeAgentOptions(
            mcp_servers={"composio": mcp_server},
            allowed_tools=[f"mcp__composio__{tool.name}" for tool in tools],
        )

        # Use with Claude Agent SDK
        async with ClaudeSDKClient(options=options) as client:
            await client.query("Get my Gmail profile using the Gmail Get Profile tool.")
        ```
    """

    def _create_tool_function(
        self,
        slug: str,
        description: str,
        input_schema: dict[str, t.Any],
        exec_fn: AgenticProviderExecuteFn,
    ) -> SdkMcpTool:
        """
        Factory function to create tool function with proper closure.

        This pattern ensures that each tool gets its own closure with the correct
        values for slug, description, schema, and execute function. The closure
        prevents variable capture issues when creating multiple tools dynamically.

        :param slug: Tool identifier/slug (e.g., "GMAIL_GET_PROFILE")
        :param description: Human-readable description of what the tool does
        :param input_schema: JSON schema dictionary defining tool input parameters
        :param exec_fn: Function to execute the Composio tool with given arguments
        :return: Decorated tool function compatible with Claude Agent SDK
        :raises: No exceptions raised, errors are returned in the response format
        """

        @tool(slug, description, input_schema)
        async def tool_function(args: dict[str, t.Any]) -> dict[str, t.Any]:
            """
            Generic dynamic wrapper for Composio tool execution.

            This function is called by Claude Agent SDK when the tool is invoked.
            It executes the Composio tool and formats the response according to
            Claude Agent SDK's expected format.

            :param args: Dictionary of arguments passed to the tool
            :return: Response in Claude Agent SDK format:
                - Success: {"content": [{"type": "text", "text": str(result)}]}
                - Error: {"content": [{"type": "text", "text": "Error: ..."}], "is_error": True}
            """
            try:
                # Execute the Composio tool synchronously
                result = exec_fn(slug, args)

                # Return in Claude Agent SDK expected format
                return {"content": [{"type": "text", "text": str(result)}]}
            except pydantic.ValidationError as e:
                # Handle validation errors with detailed parsing
                error_message = parse_pydantic_error(e)
                return {
                    "content": [
                        {"type": "text", "text": f"Validation error: {error_message}"}
                    ],
                    "is_error": True,
                }
            except Exception as e:
                # Return error in expected format
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": f"Error executing tool {slug}: {str(e)}",
                        }
                    ],
                    "is_error": True,
                }

        return tool_function

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> SdkMcpTool:
        """
        Convert a Composio tool into a Claude Agent SDK decorated tool.

        This method takes a Composio Tool object and wraps it using the @tool
        decorator pattern to create a Claude Agent SDK-compatible tool that can
        be used with create_sdk_mcp_server().

        :param tool: The Composio Tool object to wrap
        :param execute_tool: Function to execute the tool with given arguments
        :return: Decorated tool function compatible with Claude Agent SDK

        Example:
            ```python
            provider = ClaudeAgentSDKProvider()
            composio_tool = composio.tools.get(user_id="user123", tools=["GMAIL_GET_PROFILE"])[0]
            wrapped_tool = provider.wrap_tool(composio_tool, execute_tool_fn)
            ```
        """
        return self._create_tool_function(
            slug=tool.slug,
            description=tool.description or "",
            input_schema=tool.input_parameters,
            exec_fn=execute_tool,
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> t.List[SdkMcpTool]:
        """
        Wrap multiple Composio tools into Claude Agent SDK-compatible tools.

        This method processes a sequence of Composio tools and returns a list
        of wrapped tools that can be used with Claude Agent SDK's MCP server.

        :param tools: Sequence of Composio Tool objects to wrap
        :param execute_tool: Function to execute tools with given arguments
        :return: List of decorated tool functions compatible with Claude Agent SDK

        Example:
            ```python
            provider = ClaudeAgentSDKProvider()
            composio_tools = composio.tools.get(user_id="user123", tools=["GMAIL_GET_PROFILE"])
            wrapped_tools = provider.wrap_tools(composio_tools, execute_tool_fn)

            # Use with MCP server
            mcp_server = create_sdk_mcp_server(
                name="composio_tools",
                version="1.0.0",
                tools=wrapped_tools,
            )
            ```
        """
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
