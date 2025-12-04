from composio import Composio
from agents import Agent, Runner, HostedMCPTool

composio = Composio(api_key="your-composio-api-key")

print("Creating Tool Router session...")
session = composio.create("pg-user-550e8400-e29b-41d4")
print(f"Tool Router session created: {session.mcp.url}")

agent = Agent(
    name="Personal Assistant",
    instructions="You are a helpful personal assistant.",
    tools=[
        HostedMCPTool(
            tool_config={
                "type": "mcp",
                "server_label": "composio",
                "server_url": session.mcp.url,
                "require_approval": "never",
                "headers": {
                    "x-api-key": "your-composio-api-key",
                },
            }
        )
    ],
)

print("Running the OpenAI agent to fetch gmail inbox")
result = Runner.run_sync(
    agent,
    "Summarize all the emails in my Gmail inbox today"
)
print(result.final_output)
