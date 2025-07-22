from composio import Composio

composio = Composio()

# List all auth configs
auth_configs = composio.auth_configs.list()
print(auth_configs)

# Use composio managed auth
auth_config = composio.auth_configs.create(
    toolkit="github",
    options={
        "type": "use_composio_managed_auth",
    },
)
print(auth_config)

# Use custom auth
auth_config = composio.auth_configs.create(
    toolkit="notion",
    options={
        "name": "Notion Auth",
        "type": "use_custom_auth",
        "auth_scheme": "OAUTH2",
        "credentials": {
            "client_id": "1234567890",
            "client_secret": "1234567890",
            "oauth_redirect_uri": "https://backend.composio.dev/api/v3/toolkits/auth/callback",
        },
    },
)
print(auth_config)

# When creating an auth config, you can check for required fields
required_fields = composio.toolkits.get_auth_config_creation_fields(
    toolkit="NOTION",
    auth_scheme="OAUTH2",
)
print(required_fields)

# Retrieve a specific auth config
auth_config_retrieved = composio.auth_configs.get(auth_config.id)
print(auth_config_retrieved)

# Fetch required input fields for auth config
toolkit = composio.toolkits.get(slug="notion")
required_input_fields = [
    field.name for field in toolkit.auth_config_details or [] if field.mode
]
print(required_input_fields)

# Update an auth config
auth_config_updated = composio.auth_configs.update(
    auth_config.id,
    options={
        "type": "custom",
        "credentials": {
            "client_id": "1234567890",
            "client_secret": "1234567890",
        },
        "restrict_to_following_tools": ["github"],
    },
)
print(auth_config_updated)

# Enable an auth config
composio.auth_configs.enable(auth_config.id)
print("Auth config enabled")

# Disable an auth config
composio.auth_configs.disable(auth_config.id)
print("Auth config disabled")

# Delete an auth config
composio.auth_configs.delete(auth_config.id)
print("Auth config deleted")
