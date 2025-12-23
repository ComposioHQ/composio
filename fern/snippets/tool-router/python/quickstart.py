import asyncio
import os
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
from agents import Agent, Runner, HostedMCPTool

async def main() -> None:
    # Initialize Composio and create Tool Router session
    composio = Composio(
        api_key=os.getenv("COMPOSIO_API_KEY"),  # Uses env var by default
        provider=OpenAIAgentsProvider()
    )
    session = composio.experimental.tool_router.create_session(
        user_id="user@example.com",
        toolkits=["gmail", "github"]  # Optional: Limit available toolkits
    )

    # Set up OpenAI agent with Tool Router MCP endpoint
    agent = Agent(
        name="Assistant",
        instructions="You are a helpful assistant that can access Gmail and GitHub. "
                    "Help users fetch emails, create issues, manage pull requests, and more.",
        tools=[
            HostedMCPTool(
                tool_config={
                    "type": "mcp",
                    "server_label": "tool_router",
                    "server_url": session['url'],
                    "require_approval": "never",
                }
            )
        ],
    )

    # Execute the agent
    result = await Runner.run(
        agent, 
        "Fetch the contributors to composiohq/composio github repository and email the list to user@example.com"
    )
    print(result.final_output)

asyncio.run(main())