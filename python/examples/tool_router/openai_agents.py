from composio import Composio
from agents import Agent, Runner, HostedMCPTool
import os

composio = Composio()
session = composio.experimental.create(
    user_id="user_123",
)

print(session.mcp.url)

composio_mcp = HostedMCPTool(
    tool_config={
        "type": "mcp",
        "server_label": "tool_router",
        "server_url": session.mcp.url,
        "require_approval": "never",
        "headers": {"x-api-key": os.getenv("COMPOSIO_API_KEY")},
    }
)

agent = Agent(
    name="My Agent",
    instructions="You are a helpful assistant that can use the tools provided to you.",
    tools=[composio_mcp],
)

result = Runner.run_sync(
    starting_agent=agent,
    input="Find my last email and summarize it.",
)

print(result.final_output)
