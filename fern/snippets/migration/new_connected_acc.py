from composio import Composio

linear_auth_config_id = "ac_1234"
user_id = "user@email.com"
composio = Composio()

# Create a new connected account
connection_request = composio.connected_accounts.initiate(
    user_id=user_id,
    auth_config_id=linear_auth_config_id,
)
print(connection_request.redirect_url)

# Wait for the connection to be established
connected_account = connection_request.wait_for_connection()
print(connected_account)
