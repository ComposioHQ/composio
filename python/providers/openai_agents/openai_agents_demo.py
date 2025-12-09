import asyncio

from agents import Agent, Runner
from composio_openai_agents import OpenAIAgentsProvider
from composio import Composio

# Initialize Composio toolset
composio = Composio(provider=OpenAIAgentsProvider())

# Get all the tools
tools = composio.tools.get(
    user_id="default",
    tools=["GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"],
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
        starting_agent=agent,
        input=(
            "Star the repository composiohq/composio on GitHub. If done "
            "successfully, respond with 'Action executed successfully'"
        ),
    )
    print(result.final_output)


asyncio.run(main())
