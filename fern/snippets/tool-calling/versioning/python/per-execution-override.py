from composio import Composio

composio = Composio(
    api_key="YOUR_API_KEY",
    toolkit_versions={
        "github": "20250110_00"  # Default version
    }
)

# Override version for a single execution
result = composio.tools.execute(
    "GITHUB_CREATE_ISSUE",
    {
        "user_id": "user-123",
        "arguments": {
            "repo": "my-repo",
            "title": "Bug report",
            "body": "Description here"
        },
        "toolkit_version": "20250115_00"  # Override to different version
    }
)

# This execution uses the SDK default version
result2 = composio.tools.execute(
    "GITHUB_LIST_ISSUES",
    {
        "user_id": "user-123",
        "arguments": {
            "repo": "my-repo"
        }
    }
)