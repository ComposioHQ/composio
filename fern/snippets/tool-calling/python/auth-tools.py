from composio import Composio
from composio.types import auth_scheme

linear_auth_config_id = "ac_dqYN9oElNVlg"
user_id = "0000-1111-2222"
composio = Composio()

# Create a new connected account
connection_request = composio.connected_accounts.initiate(
    user_id=user_id,
    auth_config_id=linear_auth_config_id,
    config=auth_scheme.oauth2()
)
print(connection_request.redirect_url)

# Wait for the connection to be established
connected_account = connection_request.wait_for_connection()

# If you only have the connection request ID, you can also wait using:

connected_account = composio.connected_accounts.wait_for_connection(connection_request.id)
# Recommended for when connection_request object is destroyed

# API key based toolkit
serp_auth_config_id = "ac_VWmFEC55Zgv6"

# Retrieved from the user
user_api_key = "sk_1234567890"

connection_request = composio.connected_accounts.initiate(
    user_id=user_id,
    auth_config_id=serp_auth_config_id,
    config=auth_scheme.api_key(user_api_key)
)
