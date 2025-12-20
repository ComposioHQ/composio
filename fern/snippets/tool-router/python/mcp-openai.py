import os
from dotenv import load_dotenv
from composio import Composio
from agents import Agent, Runner, HostedMCPTool, ModelSettings

# Load environment variables from .env file
load_dotenv()

composio_api_key = os.environ["COMPOSIO_API_KEY"]
user_id = "user_123"  # Your user's unique identifier

print("Starting OpenAI agent with Composio...\n")

# Initialize Composio and create a Tool Router session
composio = Composio(api_key=composio_api_key)
session = composio.create(user_id=user_id)

# Configure OpenAI agent with Composio MCP server
agent = Agent(
    name="AI Assistant",
    instructions=(
        "You are a helpful assistant with access to external tools. "
        "Always use the available tools to complete user requests instead of just explaining how to do them."
    ),
    model="gpt-5.2",  
    tools=[
        HostedMCPTool(
            tool_config={
                "type": "mcp",
                "server_label": "composio",
                "server_url": session.mcp.url,
                "require_approval": "never",
                "headers": {"x-api-key": composio_api_key},
            }
        )
    ],
)

# Optional: Pre-authorize tools before use (otherwise you'll get a link during execution)
# connection_request = session.authorize("github")
# print(connection_request.redirect_url)
# connected_account = connection_request.wait_for_connection(timeout=60000)
# print(f"Connected: {connected_account.id}")

print("Running the OpenAI agent to fetch GitHub issues...\n")

# Execute a task that requires GitHub access
result = Runner.run_sync(
    starting_agent=agent,
    input=("Fetch all the open GitHub issues on the composio repository "
           "and group them by bugs/features/docs.")
)
print(f"Result: {result.final_output}")