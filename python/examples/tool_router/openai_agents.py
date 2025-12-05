from composio import Composio
from agents import Agent, Runner, HostedMCPTool

composio = Composio()
session = composio.experimental.create(
    user_id="user_123",
)

print(session.mcp)

composio_mcp = HostedMCPTool(
    tool_config={
        "type": "mcp",
        "server_label": "tool_router",
        "server_url": session.mcp.url,
        "require_approval": "never",
        "headers": session.mcp.headers,
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
