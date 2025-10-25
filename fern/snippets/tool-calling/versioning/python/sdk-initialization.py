from composio import Composio

# Initialize SDK with specific toolkit versions
composio = Composio(
    api_key="YOUR_API_KEY",
    toolkit_versions={
        "github": "20250116_00",
        "slack": "20250115_01",
        "gmail": "latest"  # Use latest version for development
    }
)

# Fetch tools - they will use the specified versions
tools = composio.tools.get(
    user_id="user-123",
    toolkits=["github", "slack"]
)

# Execute a tool - inherits version from SDK initialization
result = composio.tools.execute(
    "GITHUB_CREATE_ISSUE",
    {
        "user_id": "user-123",
        "arguments": {
            "repo": "my-repo",
            "owner": "my-org",
            "title": "Bug report",
            "body": "Issue description"
        }
    }
)