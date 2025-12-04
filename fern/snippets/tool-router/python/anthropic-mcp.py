from composio import Composio
from anthropic_agents import Agent, run

composio = Composio(api_key="your-api-key")

session = composio.create(user_id="pg-user-550e8400-e29b-41d4")

agent = Agent(
    name="Personal Assistant",
    instructions="You are a helpful personal assistant.",
    mcp_servers=[session.mcp.url]
)

result = run(
    agent,
    "Summarize all the emails in my Gmail inbox today"
)
print(result.final_output)
