import os
from composio import Composio

# Set environment variables before running your application
# export COMPOSIO_TOOLKIT_VERSION_GITHUB="20250116_00"
# export COMPOSIO_TOOLKIT_VERSION_SLACK="20250115_01"

# Or set a global version for all toolkits
# export COMPOSIO_TOOLKIT_VERSION="20250116_00"

# SDK automatically reads environment variables
composio = Composio(api_key="YOUR_API_KEY")

# Tools will use versions from environment variables
tools = composio.tools.get(
    user_id="user-123",
    toolkits=["github", "slack"]
)

# Check which versions are being used
for tool in tools:
    print(f"Tool: {tool.slug}, Version: {tool.toolkit_version}")