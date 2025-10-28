from composio import Composio

composio = Composio(
    api_key="YOUR_API_KEY",
    toolkit_versions={"github": "20250116_00"}
)

# List available versions for a toolkit
versions = composio.tools.get_toolkit_versions("github")
for version in versions[:3]:
    print(f"Version: {version['version']} - Status: {version['status']}")

# Fetch tools and inspect their versions
tools = composio.tools.get("user-123", toolkits=["github"])
for tool in tools[:3]:
    print(f"{tool.slug}: v{tool.toolkit_version}")