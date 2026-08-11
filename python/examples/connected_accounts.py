import os

from composio import Composio
from composio.types import auth_scheme

composio = Composio()

# Auth config to connect against (raises KeyError when unset)
gmail_auth_config_id = os.environ["COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID"]

# List all connected accounts
connected_accounts = composio.connected_accounts.list()
print(connected_accounts)

# Create a new connected account (OAuth)
connection_request = composio.connected_accounts.initiate(
    user_id="default",
    auth_config_id=gmail_auth_config_id,
)

# Send the user to this URL to authorize the connection
print(f"Visit this URL to authorize: {connection_request.redirect_url}")

# Wait for the connection to be established (OAuth)
connected_account = connection_request.wait_for_connection()
print(connected_account)

# Create a new connected account (API Key)
connection_request = composio.connected_accounts.initiate(
    user_id="default",
    auth_config_id=os.environ["COMPOSIO_EXAMPLES_APIKEY_AUTH_CONFIG_ID"],
    config=auth_scheme.api_key(
        options={
            "generic_api_key": os.environ["COMPOSIO_EXAMPLES_APIKEY_PLACEHOLDER"],
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
