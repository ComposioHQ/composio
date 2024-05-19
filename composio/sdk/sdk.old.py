import json
import time
from datetime import datetime
from enum import Enum
from typing import Optional, Union
import warnings

from openai import Client
from openai.types.beta import thread
from openai.types.beta.threads import run
from openai.types.chat.chat_completion import ChatCompletion
from pydantic import BaseModel, ConfigDict

from composio.sdk.exceptions import BadErrorException, InvalidParameterException, NotFoundException, TimeoutException
from composio.sdk.http_client import HttpClient

from .enums import Action, App, Tag
from .storage import get_base_url

from enum import Enum

    
class ConnectionRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    connectionStatus: str
    connectedAccountId: str
    redirectUrl: Optional[str] = None

    sdk_instance: Optional["Composio"] = None

    def __init__(self, sdk_instance: "Composio", **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance

    def authorize(
        self,
        field_inputs: dict,
        entity_id: str,
        redirect_url: Optional[str] = None, 
    ):
        connected_account_id = self.sdk_instance.get_connected_account(
            self.connectedAccountId
        )
        resp = self.sdk_instance.http_client.post(
            "v1/connectedAccounts",
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

class Composio:
    def __init__(self, api_key: str, base_url=get_base_url()):
        self.base_url = base_url
        self.api_key = api_key
        self.http_client = HttpClient(base_url)
        self.http_client.headers.update(
            {"Content-Type": "application/json", "x-api-key": self.api_key}
        )

    def list_triggers(self, app_names: list[str] = None):
        resp = self.http_client.get(
            "v1/triggers",
            params={"appNames": ",".join(app_names) if app_names else None},
        )
        return resp.json()

    def list_active_triggers(
        self, trigger_ids: list[str]
    ) -> list[ActiveTrigger]:
        url = "v1/triggers/active_triggers"
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

    def get_trigger_requirements(self, trigger_ids: list[str]):
        resp = self.http_client.get(
            "v1/triggers",
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
            "v1/triggers/setCallbackURL",
            json={
                "callbackURL": callback_url,
            },
        )
        return resp.json()

    def get_list_of_apps(self):
        resp = self.http_client.get("v1/apps")
        return resp.json()

    def get_app(self, app_name: str):
        resp = self.http_client.get(f"v1/apps/{app_name}")
        return resp.json()
    
    def get_list_of_action_by_usecase(self, app_name: Union[str, App], usecase: str):
        if isinstance(app_name, App):
            app_name = app_name.value
        resp = self.http_client.get(
            "v1/actions",
            params={"useCase": ",".join(usecases)},
        )
        return resp.json()

    def get_list_of_actions(
        self, apps: Optional[list[App]] = None, use_case: Optional[str] = None, actions: Optional[list[Action]] = None, tags: Optional[list[Union[str, Tag]]] = None, limit: Optional[int] = None
    ) -> list:
        if use_case is not None and use_case != "":
            if apps is None:
                raise ValueError("get_list_of_actions: use_case should be provided with 
            app_unique_ids = [app.value for app in apps]
            resp = self.http_client.get(
                "v1/actions",
                params={"appNames": app_unique_ids, "useCase": use_case, "limit": limit},
            )
            return resp.json()["items"]
        elif (apps is None or len(apps) == 0) and (actions is None or len(actions) == 0):
            resp = self.http_client.get("v1/actions")
            return resp.json()["items"]
        elif (apps is None or len(apps) == 0) and (actions is not None and len(actions) > 0):
            if tags is not None and len(tags) > 0:
                raise ValueError("Both actions and tags cannot be provided together")
            app_unique_ids = list(set(action.value[0] for action in actions))
            resp = self.http_client.get(
                f"v1/actions?appNames={','.join(app_unique_ids)}"
            )
            actions_response = resp.json()
            filtered_actions = []
            action_names_list = [action.value[1] for action in actions]
            for item in actions_response["items"]:
                if item["name"] in action_names_list:
                    filtered_actions.append(item)
            return filtered_actions
        elif apps is not None and len(apps) > 0:
            app_unique_ids = [app.value for app in apps]
            resp = self.http_client.get(
                f"v1/actions?appNames={','.join(app_unique_ids)}"
            )
            actions_response = resp.json()
            if tags is not None and len(tags) > 0:
                filtered_actions = []
                tag_values = [tag.value[1] if hasattr(tag, 'value') else tag for tag in tags]
                if tag_values and Tag.ALL.value[1] in tag_values:
                    return actions_response["items"]
                for item in actions_response["items"]:
                    if item["tags"] and any(tag in item["tags"] for tag in tag_values):
                        filtered_actions.append(item)
                return filtered_actions

            warnings.warn(
                "Using all the actions of an app is not recommended. "
                "Please use tags to filter actions or provide specific actions. "
                "We just pass the important actions to the agent, but this is not meant "
                "to be used in production. Check out https://docs.composio.dev/sdk/python/actions for more information.",
                UserWarning
            )
            actions = actions_response["items"]
            important_tag = Tag.IMPORTANT.value[1]
            important_actions = [action for action in actions if important_tag in (action.get("tags", []) or [])] 
            if len(important_actions) > 5:
                return important_actions
            else:
                return actions
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
