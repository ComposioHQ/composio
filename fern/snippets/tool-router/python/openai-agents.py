from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
from agents import Agent, Runner

composio = Composio(
    api_key="your-api-key",
    provider=OpenAIAgentsProvider()
)

session = composio.create(user_id="pg-user-550e8400-e29b-41d4")

agent = Agent(
    name="Personal Assistant",
    instructions="You are a helpful personal assistant.",
    tools=session.tools()
)

result = Runner.run_sync(
    agent,
    "Summarize all the emails in my Gmail inbox today"
)
print(result.final_output)
