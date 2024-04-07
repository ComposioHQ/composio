from enum import Enum
import time
from typing import Optional, Union, Tuple
import requests
from pydantic import BaseModel, ConfigDict

from .enums import Action, App, TestIntegration
from .storage import get_base_url
from openai.types.chat.chat_completion import ChatCompletion
from openai.types.beta.threads import run
from openai import Client
from openai.types.beta import thread
import json


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

    def wait_until_active(
        self, timeout=60
    ) -> "ConnectedAccount":  # Timeout adjusted to seconds
        if not self.sdk_instance:
            raise ValueError("SDK instance not set.")
        start_time = time.time()
        while time.time() - start_time < timeout:
            connection_info = self.sdk_instance.get_connected_account(
                self.connectedAccountId
            )
            if connection_info.status == "ACTIVE":
                return connection_info
            time.sleep(1)
        raise TimeoutError(
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
            f"{self.sdk_instance.base_url}/v1/actions/{action_name.value[1]}/execute",
            json={"connectedAccountId": connected_account_id, "input": params},
        )
        if resp.status_code == 200:
            return resp.json()
        raise Exception("Failed to execute action")

    def execute_action(self, action_name: Action, params: dict):
        resp = self._execute_action(action_name, self.id, params)
        return resp

    def get_all_actions(self, format: SchemaFormat = SchemaFormat.OPENAI):
        app_unique_id = self.appUniqueId
        resp = self.sdk_instance.http_client.get(
            f"{self.sdk_instance.base_url}/v1/actions?appNames={app_unique_id}"
        )
        if resp.status_code == 200:
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
            else:
                return actions["items"]

        raise Exception("Failed to get actions")

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
            print(e)
            return output

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
        self, entity_id: str = None, params: dict = {}
    ) -> ConnectionRequest:
        resp = self.sdk_instance.http_client.post(
            f"{self.sdk_instance.base_url}/v1/connectedAccounts",
            json={"integrationId": self.id, "userUuid": entity_id, "data": params},
        )
        if resp.status_code == 200:
            return ConnectionRequest(self.sdk_instance, **resp.json())

        raise Exception("Failed to create connection")

    def get_required_variables(self):
        return self.expectedInputFields


class Composio:
    def __init__(
        self, api_key: str = None, base_url=get_base_url()
    ):
        self.base_url = base_url
        self.api_key = api_key
        self.http_client = requests.Session()
        self.http_client.headers.update(
            {"Content-Type": "application/json", "x-api-key": self.api_key}
        )

    def list_triggers(self, app_names: list[str] = None):
        resp = self.http_client.get(f"{self.base_url}/v1/triggers", params={
            "appNames": ",".join(app_names) if app_names else None
        })
        return resp.json()
    
    def get_trigger_requirements(self, trigger_ids: list[str] = None):
        resp = self.http_client.get(f"{self.base_url}/v1/triggers", params={
            "triggerIds": ",".join(trigger_ids) if trigger_ids else None
        })
      
        return resp.json()
    
    def enable_trigger(self, trigger_name: str, connected_account_id: str, user_inputs: dict):
        resp = self.http_client.post(f"{self.base_url}/v1/triggers/enable/{connected_account_id}/{trigger_name}", json={
            "triggerConfig": user_inputs,
        })
        
        if resp.status_code == 200:
            return resp.json()

        raise Exception(resp.text)

    def set_global_trigger(self, callback_url: str):
        if not self.api_key:
            raise ValueError("API Key not set")

        resp = self.http_client.post(f"{self.base_url}/v1/triggers/setCallbackURL", json={
            "callbackURL": callback_url,
        })
        if resp.status_code == 200:
            return resp.json()
        
        raise Exception("Failed to set global trigger callback")

    def get_list_of_apps(self):
        resp = self.http_client.get(f"{self.base_url}/v1/apps")
        return resp.json()

    def get_list_of_actions(
        self, apps: list[App] = None, actions: list[Action] = None
    ) -> list:
        if apps is None or len(apps) == 0:
            resp = self.http_client.get(f"{self.base_url}/v1/actions")
        else:
            app_unique_ids = [app.value for app in apps]
            resp = self.http_client.get(
                f"{self.base_url}/v1/actions?appNames={','.join(app_unique_ids)}"
            )
        if resp.status_code == 200:
            actions_response = resp.json()
            if actions is not None and len(actions) > 0:
                filtered_actions = []
                action_names_list = [action.value[1] for action in actions]
                for item in actions_response["items"]:
                    if item["name"] in action_names_list:
                        filtered_actions.append(item)
                return filtered_actions
            else:
                return actions_response["items"]

        raise Exception("Failed to get actions")
    
    def get_list_of_triggers(
        self, apps: list[App] = None
    ) -> list:
        if apps is None or len(apps) == 0:
            resp = self.http_client.get(f"{self.base_url}/v1/triggers")
        else:
            app_unique_ids = [app.value for app in apps]
            resp = self.http_client.get(
                f"{self.base_url}/v1/triggers?appNames={','.join(app_unique_ids)}"
            )
        if resp.status_code == 200:
            triggers_response = resp.json()
            return triggers_response
        raise Exception("Failed to get triggers")

    def get_list_of_integrations(self) -> list[Integration]:
        resp = self.http_client.get(f"{self.base_url}/v1/integrations")
        if resp.status_code != 200:
            raise Exception("Failed to get integrations")

        resp = resp.json()
        return [Integration(self, **app) for app in resp["items"]]

    def get_integration(self, connector_id: Union[str, TestIntegration]) -> Integration:
        if isinstance(connector_id, TestIntegration):
            connector_id = connector_id.value
        resp = self.http_client.get(f"{self.base_url}/v1/integrations/{connector_id}")
        if resp.status_code == 200:
            return Integration(self, **resp.json())

        raise Exception("Failed to get connector")

    def get_connected_account(self, connection_id: str) -> ConnectedAccount:
        resp = self.http_client.get(
            f"{self.base_url}/v1/connectedAccounts/{connection_id}"
        )
        if resp.status_code == 200:
            return ConnectedAccount(self, **resp.json())

        raise Exception("Failed to get connection")

    def get_connected_accounts(
        self, entity_id: Union[list[str], str]
    ) -> list[ConnectedAccount]:
        user_uuid_str = entity_id if isinstance(entity_id, str) else ",".join(entity_id)
        resp = self.http_client.get(
            f"{self.base_url}/v1/connectedAccounts?user_uuid={user_uuid_str}"
        )
        if resp.status_code == 200:
            return [ConnectedAccount(self, **item) for item in resp.json()["items"]]

        raise Exception("Failed to get connected accounts")

    def get_list_of_connected_accounts(self) -> list[ConnectedAccount]:
        resp = self.http_client.get(f"{self.base_url}/v1/connectedAccounts")
        if resp.status_code == 200:
            return [ConnectedAccount(self, **item) for item in resp.json()["items"]]

        raise Exception("Failed to get connected accounts")

    def get_action_enum(self, action_name: str, tool_name: str) -> Action:
        for action in Action:
            if (
                action.action == action_name.lower()
                and action.service == tool_name.lower()
            ):
                return action
        raise ValueError(
            f"No matching action found for action: {action_name.lower()} and tool: {tool_name.lower()}"
        )

    def get_action_enum_without_tool(self, action_name: str) -> Action:
        for action in Action:
            if action.action == action_name.lower():
                return action
        raise ValueError(f"No matching action found for action: {action_name.lower()}")

    def get_entity(self, entity_id: Union[list[str], str]):
        entity = Entity(self, entity_id)
        return entity


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

    def get_connection(self, tool_name: str) -> ConnectedAccount:
        connected_accounts = self.client.get_connected_accounts(
            entity_id=self.entity_id
        )
        for account in connected_accounts:
            if tool_name == account.appUniqueId:
                return account

    def handle_tools_calls(
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
                            account = self.get_connection(tool_name=action.service)
                            output.append(account.execute_action(action, arguments))

        except Exception as e:
            print(e)
            return output

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
                    account = self.get_connection(tool_name=action.service)
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
            print(e)

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
        while (
            run_object.status == "queued"
            or run_object.status == "in_progress"
            or run_object.status == "requires_action"
        ):
            ## Look here
            if run_object.status == "requires_action":
                run_object = client.beta.threads.runs.submit_tool_outputs(
                    thread_id=thread_object.id,
                    run_id=run_object.id,
                    tool_outputs=self.handle_run_tool_calls(
                        run_object, verbose=verbose
                    ),  ## all tool calls executed
                )
            else:
                run_object = client.beta.threads.runs.retrieve(
                    thread_id=thread_object.id,
                    run_id=run_object.id,
                )
                time.sleep(0.5)
        return run_object

    def initiate_connection(self, integration_id: str):
        integration = self.client.get_integration(integration_id)
        return integration.initiate_connection(entity_id=self.entity_id)
