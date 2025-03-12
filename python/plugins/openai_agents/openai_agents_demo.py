import asyncio

import dotenv
from agents import Agent, Runner
from composio_openai_agents import Action, ComposioToolSet


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize Composio toolset
composio_toolset = ComposioToolSet()

# Get all the tools
tools = composio_toolset.get_tools(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

# Create an agent with the tools
agent = Agent(
    name="GitHub Agent",
    instructions="You are a helpful assistant that helps users with GitHub tasks.",
    tools=tools,
)


# Run the agent
async def main():
    result = await Runner.run(
        agent,
        "Star the repository composiohq/composio on GitHub. If done successfully, respond with 'Action executed successfully'",
    )
    print(result.final_output)


asyncio.run(main())
