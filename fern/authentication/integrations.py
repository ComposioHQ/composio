from typing import Any
from composio_openai import ComposioToolSet, App, Action
from composio.client.collections import IntegrationModel
from composio.client.collections import AuthSchemeType

toolset = ComposioToolSet()


def has_integration(app: App) -> bool:
    """
    Check if an integration exists for the given app.
    """
    integrations = toolset.get_integrations(app=app)
    return len(integrations) > 0


def create_integration_if_not_exists(
    app: App,
    auth_mode: AuthSchemeType,
    auth_config: dict,
    use_composio_oauth_app: bool = False,
    force_new_integration: bool = False,
) -> IntegrationModel:
    """
    Create an integration if it doesn't exist.
    """
    if not force_new_integration and has_integration(app):
        integrations = toolset.get_integrations(app=app)
        return integrations[0]
        
    integration = toolset.create_integration(
        app=app,
        auth_mode=auth_mode,
        auth_config=auth_config,
        use_composio_oauth_app=use_composio_oauth_app,
    )
    return integration

print(has_integration(App.GMAIL))

app = toolset.client.apps.get(name="gmail")
expected_params = toolset.fetch_expected_integration_params(
    app=app,
    auth_scheme="OAUTH2",
)
print(expected_params)

integration = create_integration_if_not_exists(
    app=App.GMAIL,
    auth_mode="OAUTH2",
    use_composio_oauth_app=True,
)
