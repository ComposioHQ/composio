from anthropic import Anthropic
from composio import Composio

# Initialize clients
composio = Composio()
anthropic = Anthropic(api_key="your-anthropic-api-key")

# Create MCP server with GitHub and Linear tools
server = composio.mcp.create(
    name="dev-workflow-server",
    toolkits=[
        {"toolkit": "github", "auth_config": "ac_github_id"},
        {"toolkit": "linear", "auth_config": "ac_linear_id"}
    ],
    allowed_tools=["GITHUB_LIST_PRS", "GITHUB_CREATE_COMMENT", "LINEAR_CREATE_ISSUE"]
)

# Generate MCP instance for user
instance = server.generate("user@example.com")

# Use MCP with Anthropic to manage development workflow
response = anthropic.beta.messages.create(
    model="claude-sonnet-4-5",
    system="You are a helpful assistant with access to GitHub and Linear tools. Use these tools to help manage development workflows. Do not ask for confirmation before using the tools.",
    max_tokens=1000,
    messages=[{
        "role": "user",
        "content": "Check my GitHub PRs for review comments, create Linear tasks for any requested changes, and update the PR descriptions with task links"
    }],
    mcp_servers=[{
        "type": "url",
        "url": instance['url'],
        "name": "composio-mcp-server"
    }],
    betas=["mcp-client-2025-04-04"]  # Enable MCP beta
)

print(response.content)