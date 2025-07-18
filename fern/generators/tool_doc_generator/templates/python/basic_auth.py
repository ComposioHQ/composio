from composio import Composio
from composio.types import auth_scheme

# Replace these with your actual values
{{toolkit_slug}}_auth_config_id = "{{auth_config_id|default:'ac_YOUR_AUTH_CONFIG_ID'}}"
user_id = "{{user_id|default:'user@example.com'}}"
username = "{{username_placeholder|default:'your_username'}}"
password = "{{password_placeholder|default:'your_password'}}"

composio = Composio()

# Create a new connected account for {{toolkit_name}} using Basic Auth
connection_request = composio.connected_accounts.initiate(
    user_id=user_id,
    auth_config_id={{toolkit_slug}}_auth_config_id,
    config=auth_scheme.basic_auth(
        username=username,
        password=password
    )
)

# Basic authentication is immediate - no redirect needed
print(f"Successfully connected {{toolkit_name}} for user {user_id}")

# You can verify the connection using:
# connected_account = composio.connected_accounts.get(user_id=user_id, app_id="{{toolkit_slug|upper}}")