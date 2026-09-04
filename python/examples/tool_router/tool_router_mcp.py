"""
Tool Router - MCP (Model Context Protocol) Example with OpenAI Agents

This example demonstrates how to use Tool Router with MCP servers and OpenAI Agents provider.
The MCP server provides a standardized way to access tools across different platforms,
and OpenAI Agents provider allows you to use these tools with OpenAI's agent framework.
"""

import asyncio
import os

from agents import Agent, HostedMCPTool, Runner
from composio_openai_agents import OpenAIAgentsProvider

from composio import Composio


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Set {name} before running this example.")
    return value


async def main():
    # Initialize Composio with OpenAI Agents provider
    composio = Composio(
        api_key=require_env("COMPOSIO_API_KEY"), provider=OpenAIAgentsProvider()
    )

    # Create a tool router session
    session = composio.create(
        # A user with connected GitHub and Gmail accounts (raises KeyError when unset)
        user_id=os.environ["COMPOSIO_EXAMPLES_USER_ID"],
        toolkits=["github", "gmail"],
        # mcp=True surfaces session.mcp on the returned type
        mcp=True,
    )

    mcpTool = HostedMCPTool(
        tool_config={
            "type": "mcp",
            "server_label": "tool_router",
            "server_url": session.mcp.url,
            "require_approval": "never",
            "headers": session.mcp.headers,  # type: ignore[typeddict-item]  # headers is typed Dict[str, Optional[str]]; the SDK always populates it with str values
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
