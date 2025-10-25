from composio import Composio

composio = Composio(api_key="YOUR_API_KEY")

# ❌ This will fail without version specification (after October 22, 2025)
try:
    result = composio.tools.execute(
        "GITHUB_CREATE_ISSUE",
        {
            "user_id": "user-123",
            "arguments": {
                "repo": "my-repo",
                "title": "Bug report",
                "body": "Issue description"
            }
        }
    )
except Exception as e:
    print(f"Error: {e}")
    print("Manual execution requires toolkit version")

# ✅ Solution 1: Specify version in execution
result = composio.tools.execute(
    "GITHUB_CREATE_ISSUE",
    {
        "user_id": "user-123",
        "arguments": {
            "repo": "my-repo",
            "title": "Bug report",
            "body": "Issue description"
        },
        "toolkit_version": "20250116_00"
    }
)

# ✅ Solution 2: Configure version at SDK level
composio_with_version = Composio(
    api_key="YOUR_API_KEY",
    toolkit_versions={"github": "20250116_00"}
)

result = composio_with_version.tools.execute(
    "GITHUB_CREATE_ISSUE",
    {
        "user_id": "user-123",
        "arguments": {
            "repo": "my-repo",
            "title": "Bug report",
            "body": "Issue description"
        }
    }
)

# ⚠️ Emergency escape hatch (not recommended for production)
result = composio.tools.execute(
    "GITHUB_CREATE_ISSUE",
    {
        "user_id": "user-123",
        "arguments": {
            "repo": "my-repo",
            "title": "Bug report",
            "body": "Issue description"
        },
        "dangerously_skip_version_check": True
    }
)