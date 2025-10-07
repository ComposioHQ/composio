from composio import Composio
composio = Composio()

userId = "hey@example.com"
# Create a tool router session
session = composio.experimental.tool_router.create_session(
    user_id=userId,
)
# Returns:
# {
#   'session_id': 'dKDoDWAGUf-hPM-Bw39pJ',
#   'url': 'https://apollo.composio.dev/v3/mcp/tool-router/dKDoDWAGUf-hPM-Bw39pJ/mcp'
# }

mcpUrl = session['url']