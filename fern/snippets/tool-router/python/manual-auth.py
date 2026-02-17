from composio import Composio

composio = Composio(api_key="your-api-key")

required_toolkits = ["gmail", "github"]

session = composio.create(
    user_id="user_123",
    manage_connections=False,  # Disable in-chat auth prompts
)

toolkits = session.toolkits()

connected = {t.slug for t in toolkits.items if t.connection.is_active}
pending = [slug for slug in required_toolkits if slug not in connected]

print(f"Connected: {connected}")
print(f"Pending: {pending}")

for slug in pending:
    connection_request = session.authorize(slug)
    print(f"Connect {slug}: {connection_request.redirect_url}")
    connection_request.wait_for_connection()

print(f"All toolkits connected! MCP URL: {session.mcp.url}")
