import asyncio
from composio import Composio
from agents import Agent, Runner
from composio_openai_agents import OpenAIAgentsProvider

composio = Composio(api_key="your-api-key", provider=OpenAIAgentsProvider())

# Create a connected account for the user for the gmail toolkit and replace with your own user id
externalUserId = "your-user-id"

# Get Gmail tools that are pre-configured
tools = composio.tools.get(user_id=externalUserId, tools=["GMAIL_SEND_EMAIL"])

agent = Agent(
    name="Email Manager", instructions="You are a helpful assistant", tools=tools
)

# Run the agent
async def main():
    result = await Runner.run(
        starting_agent=agent,
        input="Send an email to soham.g@composio.dev with the subject 'Hello from composio 👋🏻' and the body 'Congratulations on sending your first email using AI Agents and Composio!'",
    )
    print(result.final_output)

asyncio.run(main())