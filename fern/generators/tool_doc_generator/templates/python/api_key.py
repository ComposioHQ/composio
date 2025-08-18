from composio import Composio

# Replace these with your actual values
{{toolkit_slug}}_auth_config_id = "{{auth_config_id|default:'ac_YOUR_AUTH_CONFIG_ID'}}" # Auth config ID created above
user_id = "0000-0000-0000"  # UUID from database/app

composio = Composio()

def authenticate_toolkit(user_id: str, auth_config_id: str):
    # Replace this with a method to retrieve an API key from the user.
    # Or supply your own.
    user_api_key = input("[!] Enter API key")

    connection_request = composio.connected_accounts.initiate(
        user_id=user_id,
        auth_config_id=auth_config_id,
        config={"auth_scheme": "API_KEY", "val": {"generic_api_key": user_api_key}}
    )

    # API Key authentication is immediate - no redirect needed
    print(f"Successfully connected {{toolkit_name}} for user {user_id}")
    print(f"Connection status: {connection_request.status}")
    
    return connection_request.id


connection_id = authenticate_toolkit(user_id, {{toolkit_slug}}_auth_config_id)

# You can verify the connection using:
connected_account = composio.connected_accounts.get(connection_id)
print(f"Connected account: {connected_account}")