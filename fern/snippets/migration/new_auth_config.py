from composio import Composio

composio = Composio()

# Use composio managed auth
auth_config = composio.auth_configs.create(
    toolkit="notion",
    options={
        "type": "use_composio_managed_auth",
        # "type": "use_custom_auth",
        # "auth_scheme": "OAUTH2",
        # "credentials": {
        #     "client_id": "1234567890",
        #     "client_secret": "1234567890",
        #     "oauth_redirect_uri": "https://backend.composio.dev/api/v3/toolkits/auth/callback",
        # },
    },
)
print(auth_config)
