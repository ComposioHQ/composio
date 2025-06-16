from composio_openai import App, ComposioToolSet

toolset = ComposioToolSet()

integration = toolset.create_integration(
    app=App.GITHUB,
    auth_mode="OAUTH2",
    use_composio_oauth_app=True,
    # For use_composio_oauth_app=False, you can provide your own OAuth app credentials here
    # auth_config={
    #     "client_id": "123456",
    #     "client_secret": "123456"
    # }

)
print(integration.id)