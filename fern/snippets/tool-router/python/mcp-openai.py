from dotenv import load_dotenv
from composio import Composio
from agents import Agent, Runner, HostedMCPTool

load_dotenv()

# Initialize Composio (API key from env var COMPOSIO_API_KEY)
composio = Composio()
# Unique identifier of the user
user_id = "user_123"

# Create a Tool Router session for the user
session = composio.create(user_id=user_id)

# Configure OpenAI agent with Composio MCP server
agent = Agent(
    name="Personal Assistant",
    instructions="You are a helpful personal assistant. Use Composio tools to take action.",
    model="gpt-5.2",
    tools=[
        HostedMCPTool(
            tool_config={
                "type": "mcp",
                "server_label": "composio",
                "server_url": session.mcp.url,
                "require_approval": "never",
                "headers": session.mcp.headers,
            }
        )
    ],
)

# Execute the task
print("Fetching GitHub issues from the Composio repository @ComposioHQ/composio...\n")
try:
    result = Runner.run_sync(
        starting_agent=agent,
        input="Fetch all the open GitHub issues on the composio repository and group them by bugs/features/docs.",
    )
    print(result.final_output)
except Exception as e:
    print(f"[Error]: {e}")

print("\n\n---")
print("Tip: If prompted to authenticate, complete the auth flow and run again.")