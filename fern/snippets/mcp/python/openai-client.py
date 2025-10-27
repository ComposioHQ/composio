from openai import OpenAI

# Initialize OpenAI client
client = OpenAI(api_key="your-openai-api-key")

# Use the MCP server URL you generated
mcp_server_url = "https://backend.composio.dev/v3/mcp/YOUR_SERVER_ID?include_composio_helper_actions=true&user_id=YOUR_USER_ID"

# Use MCP with OpenAI Responses API
response = client.responses.create(
    model="gpt-5",
    tools=[
        {
            "type": "mcp",
            "server_label": "composio-server",  
            "server_description": "Composio MCP server for Gmail and Calendar integrations",
            "server_url": mcp_server_url,
            "require_approval": "never",
        },
    ],
    input="What meetings do I have tomorrow? Also check if I have any urgent emails",
)

print("OpenAI MCP Response:", response.output_text)