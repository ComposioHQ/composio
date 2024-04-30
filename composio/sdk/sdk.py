import json
import time
from datetime import datetime
from enum import Enum
from typing import Optional, Union

from openai import Client
from openai.types.beta import thread
from openai.types.beta.threads import run
from openai.types.chat.chat_completion import ChatCompletion
from pydantic import BaseModel, ConfigDict

from composio.sdk.exceptions import BadErrorException, InvalidParameterException, NotFoundException, TimeoutException
from composio.sdk.http_client import HttpClient

from .enums import Action, App, Tag
from .storage import get_base_url


class SchemaFormat(Enum):
    OPENAI = "openai"
    DEFAULT = "default"


class ConnectionRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    connectionStatus: str
    connectedAccountId: str
    redirectUrl: Optional[str] = None

    sdk_instance: "Composio" = None

    def __init__(self, sdk_instance: "Composio", **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance

    def save_user_access_data(
        self, field_inputs: dict, redirect_url: str = None, entity_id: str = None
    ):
        connected_account_id = self.sdk_instance.get_connected_account(
            self.connectedAccountId
        )
        resp = self.sdk_instance.http_client.post(
            f"v1/connectedAccounts",
            json={
                "integrationId": connected_account_id.integrationId,
                "data": field_inputs,
                "redirectUri": redirect_url,
                "userUuid": entity_id,
            },
        )
        return resp.json()

    def wait_until_active(
        self, timeout=60
    ) -> "ConnectedAccount":  # Timeout adjusted to seconds
        start_time = time.time()
        while time.time() - start_time < timeout:
            connection_info = self.sdk_instance.get_connected_account(
                self.connectedAccountId
            )
            if connection_info.status == "ACTIVE":
                return connection_info

            time.sleep(1)

        raise TimeoutException(
            "Connection did not become active within the timeout period."
        )


class AuthConnectionParams(BaseModel):
    scope: Optional[str] = None
    base_url: Optional[str] = None
    client_id: Optional[str] = None
    token_type: Optional[str] = None
    access_token: Optional[str] = None
    client_secret: Optional[str] = None
    consumer_id: Optional[str] = None
    consumer_secret: Optional[str] = None
    headers: Optional[dict] = None
    queryParams: Optional[dict] = None


class ActiveTrigger(BaseModel):
    id: str
    connectionId: str
    triggerName: str
    triggerConfig: dict

    def __init__(  # pylint: disable=unused-argument
        self, sdk_instance: "Composio", **data
    ):
        super().__init__(**data)


class ConnectedAccount(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    integrationId: str
    connectionParams: AuthConnectionParams
    appUniqueId: str
    id: str
    status: str
    createdAt: str
    updatedAt: str

    sdk_instance: "Composio" = None

    def __init__(self, sdk_instance: "Composio", **data):
        super().__init__(**data)
        # self.connectionParams = OAuth2ConnectionParams(**self.connectionParams)
        self.sdk_instance = sdk_instance

    def _execute_action(
        self, action_name: Action, connected_account_id: str, params: dict
    ):
        resp = self.sdk_instance.http_client.post(
            f"v1/actions/{action_name.value[1]}/execute",
            json={"connectedAccountId": connected_account_id, "input": params},
        )
        return resp.json()

    def execute_action(self, action_name: Action, params: dict):
        resp = self._execute_action(action_name, self.id, params)
        return resp

    def get_all_actions(self, format: SchemaFormat = SchemaFormat.OPENAI):
        app_unique_id = self.appUniqueId
        resp = self.sdk_instance.http_client.get(
            f"v1/actions?appNames={app_unique_id}"
        )
        actions = resp.json()
        if format == SchemaFormat.OPENAI:
                return [
                    {
                        "type": "function",
                        "function": {
                            "name": action["name"],
                            "description": action.get("description", ""),
                            "parameters": action.get("parameters", {}),
                        },
                    }
                    for action in actions["items"]
                ]
        return actions["items"]

    def handle_tools_calls(self, tool_calls: ChatCompletion) -> list[any]:
        output = []
        try:
            if tool_calls.choices:
                for choice in tool_calls.choices:
                    if choice.message.tool_calls:
                        for tool_call in choice.message.tool_calls:
                            function = tool_call.function
                            action = self.sdk_instance.get_action_enum(
                                function.name, self.appUniqueId
                            )
                            arguments = json.loads(function.arguments)
                            output.append(self.execute_action(action, arguments))
        except Exception as e:
            raise e from e

        return output


class Integration(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    id: str
    name: str
    authScheme: str
    authConfig: dict = {}
    createdAt: str
    updatedAt: str
    enabled: bool
    deleted: bool
    appId: str
    defaultConnectorId: Optional[str] = None
    expectedInputFields: list = []
    logo: str
    appName: str
    useComposioAuth: bool = False

    sdk_instance: "Composio" = None  # type: ignore

    def __init__(self, sdk_instance: "Composio", **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance

    def initiate_connection(
        self,
        entity_id: str = None,
        params: Optional[dict] = None,
        redirect_url: str = None,
    ) -> ConnectionRequest:
        resp = self.sdk_instance.http_client.post(
            f"v1/connectedAccounts",
            json={
                "integrationId": self.id,
                "userUuid": entity_id,
                "data": params or {},
                "redirectUri": redirect_url,
            },
        )
        return ConnectionRequest(self.sdk_instance, **resp.json())

    def get_required_variables(self):
        return self.expectedInputFields


class Composio:
    def __init__(self, api_key: str = None, base_url=get_base_url()):
        self.base_url = base_url
        self.api_key = api_key
        self.http_client = HttpClient(base_url)
        self.http_client.headers.update(
            {"Content-Type": "application/json", "x-api-key": self.api_key}
        )

    def list_triggers(self, app_names: list[str] = None):
        resp = self.http_client.get(
            f"v1/triggers",
            params={"appNames": ",".join(app_names) if app_names else None},
        )
        return resp.json()

    def list_active_triggers(
        self, trigger_ids: list[str] = None
    ) -> list[ActiveTrigger]:
        url = f"v1/triggers/active_triggers"
        if trigger_ids:
            url = f"{url}?triggerIds={','.join(trigger_ids)}"
        resp = self.http_client.get(url)
        if resp.status_code != 200:
            raise Exception(
                f"Failed to get active triggers, status code: {resp.status_code}, response: {resp.text}"
            )
        if resp.json().get("triggers"):
            return [ActiveTrigger(self, **item) for item in resp.json()["triggers"]]
        raise BadErrorException(
            f"Failed to get active triggers, status code: {resp.status_code}, response: {resp.text}"
        )

    def disable_trigger(self, trigger_id: str):
        resp = self.http_client.post(
            f"v1/triggers/disable/{trigger_id}"
        )
        return resp.json()

    def get_trigger_requirements(self, trigger_ids: list[str] = None):
        resp = self.http_client.get(
            f"v1/triggers",
            params={"triggerIds": ",".join(trigger_ids) if trigger_ids else None},
        )
        return resp.json()

    def enable_trigger(
        self, trigger_name: str, connected_account_id: str, user_inputs: dict
    ):
        resp = self.http_client.post(
            f"v1/triggers/enable/{connected_account_id}/{trigger_name}",
            json={
                "triggerConfig": user_inputs,
            },
        )
        return resp.json()

    def set_global_trigger(self, callback_url: str):
        if not self.api_key:
            raise ValueError("API Key not set")

        resp = self.http_client.post(
            f"v1/triggers/setCallbackURL",
            json={
                "callbackURL": callback_url,
            },
        )
        return resp.json()

    def get_list_of_apps(self):
        resp = self.http_client.get(f"v1/apps")
        return resp.json()

    def get_app(self, app_name: str):
        resp = self.http_client.get(f"v1/apps/{app_name}")
        return resp.json()

    def get_list_of_actions(
        self, apps: list[App] = None, use_case: str = None, actions: list[Action] = None, tags: list[Union[str, Tag]] = None, limit: int = None
    ) -> list:
        if use_case is not None and use_case != "":
            if len(apps) != 1:
                raise ValueError("Use case should be provided with exactly one app")
            app_unique_ids = [app.value for app in apps]
            resp = self.http_client.get(
                f"v1/actions",
                params={"appNames": app_unique_ids, "useCase": use_case, "limit": limit},
            )
            return resp.json()["items"]
        elif (apps is None or len(apps) == 0) and (actions is None or len(actions) == 0):
            resp = self.http_client.get(f"v1/actions")
            return resp.json()["items"]
        elif (apps is None or len(apps) == 0) and (actions is not None and len(actions) > 0):
            if tags is not None and len(tags) > 0:
                raise ValueError("Both actions and tags cannot be provided together")
            app_unique_ids = list(set(action.value[0] for action in actions))
            resp = self.http_client.get(
                f"v1/actions?appNames={','.join(app_unique_ids)}"
            )
            filtered_actions = []
            action_names_list = [action.value[1] for action in actions]
            for item in actions_response["items"]:
                if item["name"] in action_names_list:
                    filtered_actions.append(item)
            return filtered_actions
        elif apps is not None and len(apps) > 0:
            app_unique_ids = [app.value for app in apps]
            print(f"app_unique_ids: {app_unique_ids}")
            resp = self.http_client.get(
                f"v1/actions?appNames={','.join(app_unique_ids)}"
            )
            actions_response = resp.json()
            if tags is not None and len(tags) > 0:
                filtered_actions = []
                for item in actions_response["items"]:
                    if item["tags"] and any(tag in item["tags"] for tag in tags):
                        filtered_actions.append(item)
                return filtered_actions
            return actions_response["items"]
        else:
            raise ValueError("Either apps or actions must be provided")

    def get_list_of_triggers(self, apps: list[App] = None) -> list:
        if apps is None or len(apps) == 0:
            resp = self.http_client.get(f"v1/triggers")
        else:
            app_unique_ids = [app.value for app in apps]
            resp = self.http_client.get(
                f"v1/triggers?appNames={','.join(app_unique_ids)}"
            )
        return resp.json()

    def get_list_of_integrations(self) -> list[Integration]:
        resp = self.http_client.get(f"v1/integrations")
        resp = resp.json()
        if resp.get("items"):
            return [Integration(self, **app) for app in resp["items"]]
        raise BadErrorException(f"Failed to get integrations, response: {resp.text}")

    def get_default_integration(self, appName: Union[str, App]) -> Integration:
        if isinstance(appName, App):
            appName = appName.value

        return self.create_integration(appName, use_default=True)

    def get_integration(self, connector_id: str) -> Integration:
        resp = self.http_client.get(f"v1/integrations/{connector_id}")
        return Integration(self, **resp.json())

    def create_integration(
        self,
        app: Union[App, str],
        use_default=False,
        name: str = None,
        auth_mode: str = None,
    ) -> Integration:
        if isinstance(app, App):
            app = app.value
        app_details = self.get_app(app)
        app_id = app_details.get("appId")
        if app_id is None:
            raise NotFoundException(f"App {app} does not exist for the account")
        req = {"appId": app_id, "useComposioAuth": use_default}
        if name:
            req["name"] = name
        if auth_mode:
            req["authScheme"] = auth_mode
            auth_schemes = app_details.get("auth_schemes")
            for auth_scheme_iter in auth_schemes:
                if auth_scheme_iter.get("auth_mode") == auth_mode:
                    fields = auth_scheme_iter.get("fields")
                    req["authConfig"] = {field.get("name"): "" for field in fields}
        resp = self.http_client.post("v1/integrations", json=req)
        return Integration(self, **resp.json())

    def get_connected_account(self, connection_id: str) -> ConnectedAccount:
        resp = self.http_client.get(
            f"v1/connectedAccounts/{connection_id}"
        )
        return ConnectedAccount(self, **resp.json())

    def get_connected_accounts(
        self, entity_id: Union[list[str], str] = None, showActiveOnly: bool = None
    ) -> list[ConnectedAccount]:
        query_params = {}
        if entity_id is not None:
            query_params["user_uuid"] = (
                entity_id if isinstance(entity_id, str) else ",".join(entity_id)
            )
        if showActiveOnly:
            query_params["showActiveOnly"] = str("true" if showActiveOnly else "false")

        query_string = "&".join(
            [f"{key}={value}" for key, value in query_params.items()]
        )
        url = "v1/connectedAccounts"
        if query_string:
            url += f"?{query_string}"

        resp = self.http_client.get(url)
        return [ConnectedAccount(self, **item) for item in resp.json()["items"]]

    def get_action_enum(self, action_name: str, tool_name: str) -> Action:
        for action in Action:
            if (
                action.action == action_name.lower()
                and action.service == tool_name.lower()
            ):
                return action
        raise NotFoundException(
            f"No matching action found for action: {action_name.lower()} and tool: {tool_name.lower()}"
        )

    def get_action_enum_without_tool(self, action_name: str) -> Action:
        for action in Action:
            if action.action == action_name.lower():
                return action
        raise NotFoundException(f"No matching action found for action: {action_name.lower()}")

    def get_entity(self, entity_id: Union[list[str], str]):
        entity = Entity(self, entity_id)
        return entity

    def no_auth_execute_action(self, action: Action, params: dict):
        tool_name = action.value[0]
        resp = self.http_client.post(
            f"v1/actions/{action.value[1]}/execute",
            json={"appName": tool_name, "input": params},
        )
        return resp.json()


class Entity:
    def __init__(self, composio: Composio, entity_id: Union[list[str], str]) -> None:
        self.client = composio
        entity_id = entity_id if isinstance(entity_id, str) else ",".join(entity_id)
        self.entity_id = entity_id

    def get_all_actions(self) -> list[Action]:
        actions = []
        connected_accounts = self.client.get_connected_accounts(
            entity_id=self.entity_id
        )

        for account in connected_accounts:
            account_actions = account.get_all_actions()
            actions.extend(account_actions)
        return actions

    def get_connection(self, app_name: Union[str, App]) -> Optional[ConnectedAccount]:
        if isinstance(app_name, App):
            app_name = app_name.value
        connected_accounts = self.client.get_connected_accounts(
            entity_id=self.entity_id, showActiveOnly=True
        )
        latest_account = None
        latest_creation_date = None
        for account in connected_accounts:
            if app_name == account.appUniqueId:
                creation_date = datetime.fromisoformat(
                    account.createdAt.replace("Z", "+00:00")
                )
                if latest_account is None or creation_date > latest_creation_date:
                    latest_account = account
                    latest_creation_date = creation_date
        if latest_account:
            return latest_account

        return None

    def is_app_authenticated(self, app_name: Union[str, App]) -> bool:
        connected_account = self.get_connection(app_name)
        return connected_account is not None

    def handle_tools_calls(  # pylint: disable=unused-argument
        self, tool_calls: ChatCompletion, verbose: bool = False
    ) -> list[any]:
        output = []
        try:
            if tool_calls.choices:
                for choice in tool_calls.choices:
                    if choice.message.tool_calls:
                        for tool_call in choice.message.tool_calls:
                            action_name_to_execute = tool_call.function.name
                            action = self.client.get_action_enum_without_tool(
                                action_name=action_name_to_execute
                            )
                            arguments = json.loads(tool_call.function.arguments)
                            account = self.get_connection(app_name=action.service)
                            output.append(account.execute_action(action, arguments))

        except Exception as e:
            raise e from e

        return output

    def handle_run_tool_calls(self, run_object: run, verbose: bool = False):
        outputs = []
        require_action = run_object.required_action.submit_tool_outputs
        try:
            for tool_call in require_action.tool_calls:
                if tool_call.type == "function":
                    action_name_to_execute = tool_call.function.name
                    action = self.client.get_action_enum_without_tool(
                        action_name=action_name_to_execute
                    )
                    arguments = json.loads(tool_call.function.arguments)
                    account = self.get_connection(app_name=action.service)
                    if verbose:
                        print("Executing Function: ", action)
                        print("Arguments: ", arguments)
                    response = account.execute_action(action, arguments)
                    if verbose:
                        print("Output", response)
                    output = {
                        "tool_call_id": tool_call.id,
                        "output": json.dumps(response.get("response_data", {})),
                    }
                    outputs.append(output)
        except Exception as e:
            raise e from e

        return outputs

    def wait_and_handle_tool_calls(
        self,
        client: Client,
        run: run,
        thread: thread,
        verbose: bool = False,
    ):
        run_object = run
        thread_object = thread
        while run_object.status in ("queued", "in_progress", "requires_action"):
            # Look here
            if run_object.status == "requires_action":
                run_object = client.beta.threads.runs.submit_tool_outputs(
                    thread_id=thread_object.id,
                    run_id=run_object.id,
                    tool_outputs=self.handle_run_tool_calls(
                        run_object, verbose=verbose
                    ),  # all tool calls executed
                )
            else:
                run_object = client.beta.threads.runs.retrieve(
                    thread_id=thread_object.id,
                    run_id=run_object.id,
                )
                time.sleep(0.5)
        return run_object

    def initiate_connection(
        self,
        integration: Integration = None,
        app_name: Union[str, App] = None,
        redirect_url: str = None,
    ):
        if not integration and not app_name:
            raise InvalidParameterException("Either 'integration' or 'app_name' must be provided")
        if not integration:
            integration = self.client.get_default_integration(app_name)
        return integration.initiate_connection(
            entity_id=self.entity_id, redirect_url=redirect_url
        )

    def initiate_connection_not_oauth(
        self, app_name: Union[str, App], redirect_url: str = None, auth_mode: str = None
    ):
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        integration = self.client.create_integration(
            app_name, name=f"integration_{timestamp}", auth_mode=auth_mode
        )
        return integration.initiate_connection(
            entity_id=self.entity_id, redirect_url=redirect_url
        )
