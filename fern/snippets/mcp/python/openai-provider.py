from openai import OpenAI
from composio import Composio

# Initialize clients
composio = Composio()
openai = OpenAI(api_key="your-openai-api-key")

# Create MCP server with Google Sheets and Notion tools
server = composio.mcp.create(
    name="data-docs-server",
    toolkits=[
        {"toolkit": "googlesheets", "auth_config": "ac_sheets_id"},
        {"toolkit": "notion", "auth_config": "ac_notion_id"}
    ],
    allowed_tools=["GOOGLESHEETS_GET_DATA", "GOOGLESHEETS_UPDATE_DATA", "NOTION_CREATE_PAGE"]
)

# Generate MCP instance for user
instance = server.generate("user@example.com")

# Use MCP with OpenAI for data management
response = openai.responses.create(
    model="gpt-5",
    tools=[
        {
            "type": "mcp",
            "server_label": "composio-server",  
            "server_description": "Composio MCP server with Google Sheets and Notion integrations",
            "server_url": instance['url'],
            "require_approval": "never",
        },
    ],
    input="Export the Q4 metrics from Google Sheets and create a comprehensive Notion page with charts and analysis",
)

print("OpenAI MCP Response:", response.output_text)