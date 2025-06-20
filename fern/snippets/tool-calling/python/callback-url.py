from composio import Composio
from composio.types import auth_scheme

# Initialize Composio client
composio = Composio()
linear_auth_config_id = "ac_dqYN9oElNVlg"
user_id = "0000-1111-2222"

# Create a new connected account
connection_request = composio.connected_accounts.initiate(
    user_id=user_id, auth_config_id=linear_auth_config_id, config=auth_scheme.oauth2()
)
print(connection_request.redirect_url)

# Wait for the connection to be established
connected_account = connection_request.wait_for_connection()