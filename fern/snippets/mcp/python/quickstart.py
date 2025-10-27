from composio import Composio

# Initialize Composio
composio = Composio(api_key="YOUR_API_KEY")

# Create MCP server with multiple toolkits
server = composio.mcp.create(
    name="mcp-config-73840", # Pick a unique name for your MCP server
    toolkits=[
        {
            "toolkit": "gmail",
            "auth_config": "ac_xyz123"  # Your Gmail auth config ID
        },
        {
            "toolkit": "googlecalendar",
            "auth_config": "ac_abc456"  # Your Google Calendar auth config ID
        }
    ],
    allowed_tools=["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL", "GOOGLECALENDAR_EVENTS_LIST"]
)

print(f"Server created: {server.id}")
print(server.id)

# Generate server instance for user
instance = composio.mcp.generate(user_id="user-73840", mcp_config_id=server.id) # Use the user ID for which you created the connected account

print(f"MCP Server URL: {instance['url']}")