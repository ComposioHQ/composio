from composio import Composio
composio = Composio()

userId = "hey@example.com"
# Create a tool router session
session = composio.experimental.tool_router.create_session(
    user_id=userId,
)

mcpUrl = session['url']