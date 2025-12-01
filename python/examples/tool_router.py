from composio import Composio

composio = Composio(api_key="ygi05bq7zmrjfbkl5xen")

session = composio.tool_router.create(
    user_id="user_123",
    toolkits=["github", "slack"],
    manage_connections=True,
)

connection_request = session.authorize("github")
print(connection_request.redirect_url)

connected_account = connection_request.wait_for_connection()
print(connected_account)
