import asyncio

from agents import Agent, Runner

from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider

# Initialize Composio toolset
user_id = "user@email.com"
composio = Composio(provider=OpenAIAgentsProvider())

# Initialize connection request
connection_request = composio.toolkits.authorize(user_id=user_id, toolkit="github")
print(f"🔗 Visit the URL to authorize:\n👉 {connection_request.redirect_url}")

# wait for the connection to be active
connection_request.wait_for_connection()

# Get all the tools
tools = composio.tools.get(
    user_id=user_id,
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
