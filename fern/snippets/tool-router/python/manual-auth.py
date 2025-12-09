from composio import Composio
from agents import Agent, Runner, HostedMCPTool

composio = Composio(api_key="your-composio-api-key")

user_id = "pg-user-550e8400-e29b-41d4"
required_toolkits = ["gmail", "googlecalendar", "linear", "slack"]

session = composio.create(
    user_id=user_id,
    manage_connections=False,
)

toolkits = session.toolkits()

def is_connected(slug):
    toolkit = next((t for t in toolkits if t.slug == slug), None)
    return toolkit and toolkit.connected_account

pending = [slug for slug in required_toolkits if not is_connected(slug)]

if pending:
    print("Connect these apps to continue:")

    for slug in pending:
        connection_request = session.authorize(
            slug,
            callback_url="https://yourapp.com/onboarding"
        )
        print(f"  {slug}: {connection_request.redirect_url}")
        connection_request.wait_for_connection(60000)
        print(f"  {slug} connected")

print("\nAll apps connected. Starting assistant...")

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
            }
        )
    ],
)

result = Runner.run_sync(agent, "Summarize my emails from today")
print(result.final_output)
