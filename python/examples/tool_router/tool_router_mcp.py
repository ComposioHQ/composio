"""
Tool Router - MCP (Model Context Protocol) Example with OpenAI Agents

This example demonstrates how to use Tool Router with MCP servers and OpenAI Agents provider.
The MCP server provides a standardized way to access tools across different platforms,
and OpenAI Agents provider allows you to use these tools with OpenAI's agent framework.
"""

import os
import asyncio
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
from agents import Agent, Runner, HostedMCPTool


async def main():
    # Initialize Composio with OpenAI Agents provider
    # Set COMPOSIO_API_KEY environment variable or pass api_key parameter
    api_key = os.environ.get("COMPOSIO_API_KEY")
    if not api_key:
        print("Error: COMPOSIO_API_KEY environment variable not set")
        print("Please set it using: export COMPOSIO_API_KEY='your_api_key'")
        return

    composio = Composio(api_key=api_key, provider=OpenAIAgentsProvider())

    # Create a tool router session
    session = composio.tool_router.create(
        user_id="user_123",
        toolkits=["github", "gmail"],
    )

    mcpTool = HostedMCPTool(
        tool_config={
            "type": "mcp",
            "server_label": "tool_router",
            "server_url": session.mcp.url,
            "require_approval": "never",
            "headers": session.mcp.headers,
        }
    )

    print(f"Session created: {session.session_id}")
    print(f"MCP Server URL: {session.mcp.url}")
    print(f"MCP Server Type: {session.mcp.type}")

    # Create an agent with the tools from tool router
    agent = Agent(
        name="MCP Tool Router Agent",
        instructions=(
            "You are a helpful assistant that can use GitHub and Gmail tools "
            "through the MCP (Model Context Protocol) server. "
            "Help users with their GitHub and email tasks."
        ),
        tools=[mcpTool],
    )

    # Run the agent with a sample task
    print("\n--- Running Agent with Tool Router Tools ---")
    result = await Runner.run(
        starting_agent=agent,
        input=(
            "List my recent GitHub repositories and tell me about them. "
            "If successful, respond with a summary of what you found."
        ),
    )
    print(f"\nAgent Result: {result.final_output}")


if __name__ == "__main__":
    asyncio.run(main())
