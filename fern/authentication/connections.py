import json

from composio.client.collections import ExpectedFieldInput
from composio.exceptions import NoItemsFound
from composio_openai import App, ComposioToolSet

toolset = ComposioToolSet()

integration_id = "fd6441eb-c51f-4153-9f31-d4de124ce3eb"
user_id = "00000000-0000-0000-0000-000000000002"
app = App.AGENCYZOOM


def connection_exists(user_id: str, app: App):
    entity = toolset.get_entity(user_id)
    try:
        connection = entity.get_connection(app=app)
        return connection.status == "ACTIVE"
    except NoItemsFound:
        return False


def request_connection_params(app: App, integration_id: str):
    return toolset.get_expected_params_for_user(integration_id=integration_id)


def prompt_for_connection_params(connection_params_info: list[ExpectedFieldInput]):
    print(
        "\nTo connect to this service, you'll need to provide the following authentication details:"
    )
    print("=" * 80)
    print()

    connection_params = {}
    for param in connection_params_info:
        param_dict = param.model_dump()
        print(f"Parameter: {param_dict['name']}")
        print(f"Type: {param_dict['type']}")
        print(f"Description: {param_dict['description']}")
        print("-" * 40)

        # Collect input from user
        value = input(f"Enter value for {param_dict['name']}: ")
        connection_params[param_dict["name"]] = value
        print()

    return connection_params


def initiate_connection(
    user_id: str, app: App, connection_params: dict, auth_mode: str, redirect_url: str
):
    entity = toolset.get_entity(user_id)
    connection = entity.initiate_connection(
        app_name=app,
        use_composio_auth=False,
        force_new_integration=True,
        connected_account_params=connection_params,
        auth_mode=auth_mode,
        redirect_url=redirect_url,
    )
    return connection


if connection_exists(user_id, app):
    print("Connection already exists for this user")
else:
    print("\nSetting up new connection...")
    connection_params_info = request_connection_params(app, integration_id)
    connection_params = prompt_for_connection_params(
        connection_params_info["expected_params"]
    )

    print(connection_params_info["expected_params"])

    # auth_schemes = toolset.get_auth_schemes(app=app)
    # for scheme in auth_schemes:
    #     print(scheme.model_dump_json(indent=4))

    # connection = initiate_connection(user_id, app, connection_params, "API_KEY", "https://www.google.com")
    # print(connection.model_dump_json(indent=4))
