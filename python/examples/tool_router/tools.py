"""
Tool Router - OpenAI Agents Example

This example demonstrates how to use Tool Router with OpenAI Agents framework.
OpenAI Agents provides a powerful way to build AI agents that can use tools
and execute complex workflows.
"""

import asyncio
from agents import Agent, Runner
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider


async def main():
    # Initialize Composio with OpenAI Agents provider
    composio = Composio(provider=OpenAIAgentsProvider())

    # Create a tool router session for a specific user
    # This creates an isolated session with tools for the specified toolkits
    session = composio.tool_router.create(
        user_id="pg-test-37ee710c-d5be-4775-91f2-a8e06b937d9b",
        toolkits=["github", "slack"],
        manage_connections=True,
    )

    print(f"Session created: {session.session_id}")
    print(f"MCP Server: {session.mcp.url}")

    # Get tools wrapped for OpenAI Agents
    # These tools are ready to be used with the OpenAI Agents framework
    tools = session.tools()

    print(f"\nAvailable tools: {len(tools)}")

    # Create an agent with the tools from the session
    agent = Agent(
        name="GitHub & Slack Assistant",
        instructions=(
            "You are a helpful assistant that helps users manage their "
            "GitHub and Slack accounts. You can check notifications, "
            "send messages, and perform various actions on both platforms."
        ),
        tools=tools,
    )

    # Define the task
    task = "Get my last 5 GitHub notifications and summarize them"

    print(f"\nTask: {task}")
    print("\nAgent working...\n")

    # Run the agent
    result = await Runner.run(
        starting_agent=agent,
        input=task,
    )

    # Print the final output
    print("\n" + "=" * 50)
    print("RESULT:")
    print("=" * 50)
    print(result.final_output)


if __name__ == "__main__":
    asyncio.run(main())
