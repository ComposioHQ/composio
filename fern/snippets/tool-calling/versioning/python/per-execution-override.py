from composio import Composio

composio = Composio(api_key="YOUR_API_KEY")

# Specify version directly in execute call
result = composio.tools.execute(
    "GITHUB_CREATE_ISSUE",
    {
        "user_id": "user-123",
        "arguments": {
            "repo": "my-repo",
            "title": "Critical fix"
        },
        "toolkit_version": "20250116_00"  # Version for this execution
    }
)