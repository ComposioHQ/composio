from composio import Composio

composio = Composio()
user_id = "uuid-1234-5678-9012"

tools = composio.tools.get(
    user_id,
    toolkits=["GITHUB"]
)

# Fetch with limit for a specific user
tools = composio.tools.get(
    user_id,
    toolkits=["GITHUB"],
    limit=5  # Get top 5 tools
)

# Same filter but without user_id (for schemas)
raw_tools = composio.tools.get_raw_composio_tools(
    toolkits=["GITHUB"],
    limit=5
)

# Fetch specific tools by name
tools = composio.tools.get(
    user_id,
    tools=["GITHUB_CREATE_ISSUE", "GITHUB_CREATE_PULL_REQUEST"]
)

# Get schemas without user_id
raw_tools = composio.tools.get_raw_composio_tools(
    tools=["GITHUB_CREATE_ISSUE", "GITHUB_CREATE_PULL_REQUEST"]
)

# Filter by OAuth scopes (single toolkit only)
tools = composio.tools.get(
    user_id,
    toolkits=["GITHUB"],
    scopes=["write:org"]
)

# Search tools semantically
tools = composio.tools.get(
    user_id,
    search="create calendar event"
)

# Search schemas without user_id
raw_tools = composio.tools.get_raw_composio_tools(
    search="create calendar event"
)

# Search within a specific toolkit
tools = composio.tools.get(
    user_id,
    search="issues",
    toolkits=["GITHUB"],
)

# Search toolkit schemas without user_id
raw_tools = composio.tools.get_raw_composio_tools(
    search="issues",
    toolkits=["GITHUB"]
)

tool = composio.tools.get_raw_composio_tool_by_slug("GMAIL_SEND_EMAIL")