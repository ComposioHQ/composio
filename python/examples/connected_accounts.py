from composio import Composio
from composio.types import auth_scheme

composio = Composio()

# List all connected accounts
connected_accounts = composio.connected_accounts.list()
print(connected_accounts)

# Create a new connected account (OAuth)
connection_request = composio.connected_accounts.initiate(
    user_id="1234567890",
    auth_config_id="1234567890",
)
print(connection_request)

# Wait for the connection to be established (OAuth)
connected_account = connection_request.wait_for_connection()
print(connected_account)

# Create a new connected account (API Key)
connection_request = composio.connected_accounts.initiate(
    user_id="1234567890",
    auth_config_id="1234567890",
    config=auth_scheme.api_key(
        options={
            "api_key": "1234567890",
        },
    ),
)
print(connection_request)

# When creating a connected account, you can check for required fields
required_fields = composio.toolkits.get_connected_account_initiation_fields(
    toolkit="NOTION",
    auth_scheme="API_KEY",
)
print(required_fields)

# Retrieve a specific connected account
connected_account_retrieved = composio.connected_accounts.get(connected_account.id)
print(connected_account_retrieved)

# Disable a connected account
composio.connected_accounts.disable(connected_account.id)
print("Connected account disabled")

# Enable a connected account
composio.connected_accounts.enable(connected_account.id)
print("Connected account enabled")

# Delete a connected account
composio.connected_accounts.delete(connected_account.id)
print("Connected account deleted")
