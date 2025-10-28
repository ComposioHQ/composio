from composio import Composio

user_id = "user-k7334"
# Configure toolkit versions at SDK level
composio = Composio(
    api_key="your_composio_key",
    toolkit_versions={"github": "20250116_00"}
)

# Find available arguments for any tool in the Composio dashboard
result = composio.tools.execute(
    "GITHUB_LIST_STARGAZERS",
    user_id=user_id,
    arguments={"owner": "ComposioHQ", "repo": "composio", "page": 1, "per_page": 5}
)
print(result)