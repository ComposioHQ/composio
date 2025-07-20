from composio import Composio
from composio.types import auth_scheme

# Replace these with your actual values
{{toolkit_slug}}_auth_config_id = "{{auth_config_id|default:'ac_YOUR_AUTH_CONFIG_ID'}}" # Auth config ID created above
user_id = "0000-0000-0000"  # UUID from database/application

composio = Composio()


def authenticate_toolkit(user_id: str, auth_config_id: str):
    connection_request = composio.connected_accounts.initiate(
        user_id=user_id,
        auth_config_id=auth_config_id,
    )

    print(
        f"Visit this URL to authenticate {{toolkit_name}}: {connection_request.redirect_url}"
    )

    # This will wait for the auth flow to be completed
    connection_request.wait_for_connection(timeout=15)
    return connection_request.id


connection_id = authenticate_toolkit(user_id, {{toolkit_slug}}_auth_config_id)

# You can also verify the connection status using:
connected_account = composio.connected_accounts.get(connection_id)
print(f"Connected account: {connected_account}")