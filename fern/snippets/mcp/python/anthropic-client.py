from anthropic import Anthropic

# Initialize Anthropic client
client = Anthropic(api_key="your-anthropic-api-key")

# Use the MCP server URL you generated
mcp_server_url = "https://backend.composio.dev/v3/mcp/YOUR_SERVER_ID?include_composio_helper_actions=true&user_id=YOUR_USER_ID"

# Use MCP with Anthropic (beta feature)
response = client.beta.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1000,
    messages=[{
        "role": "user",
        "content": "What meetings do I have tomorrow? Also check if I have any urgent emails"
    }],
    mcp_servers=[{
        "type": "url",
        "url": mcp_server_url,
        "name": "composio-gmail-calendar-mcp-server"
    }],
    betas=["mcp-client-2025-04-04"]  # Enable MCP beta
)

print(response.content)