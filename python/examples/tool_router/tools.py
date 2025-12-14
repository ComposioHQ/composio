"""
Tool Router - OpenAI Agents Example

This example demonstrates how to use Tool Router with OpenAI Agents framework.
OpenAI Agents provides a powerful way to build AI agents that can use tools
and execute complex workflows.
"""

import asyncio
from agents import Agent, Runner
from composio import Composio, after_execute, before_execute
from composio.types import ToolExecuteParams, ToolExecutionResponse
from composio_openai_agents import OpenAIAgentsProvider


async def main():
    # Initialize Composio with OpenAI Agents provider
    composio = Composio(provider=OpenAIAgentsProvider())

    # Create a tool router session for a specific user
    # This creates an isolated session with tools for the specified toolkits
    session = composio.create(
        user_id="user_123",
        toolkits=["gmail"],
    )

    # Define logging modifiers to track tool calls
    # Pass empty lists to apply to all tools
    @before_execute(tools=[])
    def log_before_execute(
        tool: str,
        toolkit: str,
        params: ToolExecuteParams,
    ) -> ToolExecuteParams:
        """Log tool execution before it runs."""
        print(f"🔧 Executing tool: {toolkit}.{tool}")
        print(f"   Arguments: {params.get('arguments', {})}")
        return params

    @after_execute(tools=[])
    def log_after_execute(
        tool: str,
        toolkit: str,
        response: ToolExecutionResponse,
    ) -> ToolExecutionResponse:
        """Log tool execution after it completes."""
        print(f"✅ Completed tool: {toolkit}.{tool}")
        if "data" in response:
            print(f"   Response data: {response['data']}")
        return response

    # Get tools wrapped for OpenAI Agents with logging modifiers
    # These tools are ready to be used with the OpenAI Agents framework
    tools = session.tools(modifiers=[log_before_execute, log_after_execute])

    print(f"\nAvailable tools: {len(tools)}")

    # Create an agent with the tools from the session
    agent = Agent(
        name="Gmail Assistant",
        instructions=(
            "You are a helpful assistant that helps users manage their "
            "Gmail accounts. You can check emails, "
            "send messages, and perform various actions on the Gmail platform."
        ),
        tools=tools,
    )

    # Define the task
    task = "Fetch my last email from gmail and summarize it"

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
