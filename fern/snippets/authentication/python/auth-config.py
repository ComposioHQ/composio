from composio import Composio

composio = Composio()

# Use custom auth
auth_config = composio.auth_configs.create(
    toolkit="perplexityai",
    options={
        "type": "use_custom_auth",
        "auth_scheme": "API_KEY",
        "credentials": {
            "api_key": "your_api_key_here"
        }
    },
)
print(auth_config)
