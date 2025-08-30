import asyncio
from agents import Agent, Runner
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider

# Use a unique identifier for each user in your application
user_id = "user-k7334"

# Initialize Composio toolset
composio = Composio(provider=OpenAIAgentsProvider(), api_key="your_composio_api_key")

# Get all tools for the user
tools = composio.tools.get(
    user_id=user_id,
    toolkits=["COMPOSIO_SEARCH"],
)

# Create an agent with the tools
agent = Agent(
    name="Deep Researcher",
    instructions="You are an investigative journalist.",
    tools=tools,
)

async def main():
    result = await Runner.run(
        starting_agent=agent,
        input=("Do a thorough DEEP research on Golden Gate Bridge"),
    )
    print(result.final_output)

# Run the agent
asyncio.run(main())
