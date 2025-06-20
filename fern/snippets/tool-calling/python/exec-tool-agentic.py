import asyncio
from agents import Agent, Runner
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
from uuid import uuid4

user_id = uuid4()

# Initialize Composio toolset
composio = Composio(provider=OpenAIAgentsProvider())

# Get all the tools
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


# Run the agent
async def main():
    result = await Runner.run(
        starting_agent=agent,
        input=("Do a thorought DEEP research on Ilya Sutskever"),
    )
    print(result.final_output)


asyncio.run(main())
