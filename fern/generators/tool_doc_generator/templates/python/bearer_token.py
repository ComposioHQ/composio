from composio import Composio

# Auth config ID created above
{{toolkit_slug}}_auth_config_id = "{{auth_config_id|default:'ac_YOUR_AUTH_CONFIG_ID'}}" 

# UUID from database/application
user_id = "0000-0000-0000"

composio = Composio()


def authenticate_toolkit(user_id: str, auth_config_id: str):
    # Replace this with a method to retrieve the Bearer Token from the user.
    bearer_token = input("[!] Enter bearer token")
    connection_request = composio.connected_accounts.initiate(
        user_id=user_id,
        auth_config_id=auth_config_id,
        config={"auth_scheme": "BEARER_TOKEN", "val": bearer_token}
    )
    print(f"Successfully connected {{toolkit_name}} for user {user_id}")
    print(f"Connection status: {connection_request.status}")
    
    return connection_request.id


connection_id = authenticate_toolkit(user_id, {{toolkit_slug}}_auth_config_id)

# You can verify the connection using:
connected_account = composio.connected_accounts.get(connection_id)
print(f"Connected account: {connected_account}")