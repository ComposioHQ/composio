"""
Composio SDK tools.
"""

import os
import time
import typing as t
import json
from pathlib import Path
import base64

from composio.client import Composio
from composio.client.collections import ActionModel
from composio.client.enums import Action, App, Tag
from composio.client.local_handler import LocalToolHandler
from composio.constants import (
    DEFAULT_ENTITY_ID,
    ENV_COMPOSIO_API_KEY,
    LOCAL_CACHE_DIRECTORY_NAME,
    LOCAL_OUTPUT_FILE_DIRECTORY_NAME,
    USER_DATA_FILE_NAME,
)
from composio.client.collections import SuccessExecuteActionResponseModel, FileModel
from composio.exceptions import raise_api_key_missing
from composio.storage.user import UserData


class ComposioToolSet:
    """Composio toolset."""

    _remote_client: Composio

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        runtime: t.Optional[str] = None,
        output_in_file: bool = False,
        entity_id: str = DEFAULT_ENTITY_ID,
    ) -> None:
        """
        Initialize composio toolset

        :param api_key: Composio API key
        :param base_url: Base URL for the Composio API server
        :param runtime: Name of the framework runtime, eg. openai, crewai...
        :param output_in_file: Whether to output the result to a file.
        :param entity_id: The ID of the entity to execute the action on. Defaults to "default".
        """
        self._local_client = LocalToolHandler()
        if runtime is not None:
            self._runtime = runtime

        self.entity_id = entity_id
        self.output_in_file = output_in_file
        self.base_url = base_url
        # Check check constructor aegument, environment variables and user data for the key
        try:
            self.api_key = (
                api_key
                or os.environ.get(ENV_COMPOSIO_API_KEY)
                or UserData.load(
                    Path.home() / LOCAL_CACHE_DIRECTORY_NAME / USER_DATA_FILE_NAME
                ).api_key
            )
        except FileNotFoundError:
            pass

    @property
    def client(self) -> Composio:
        if self.api_key is None:
            raise_api_key_missing()
        return Composio(
            api_key=self.api_key,
            base_url=self.base_url,
        )

    @property
    def runtime(self) -> str:
        return self._runtime

    def execute_action(
        self,
        action: t.Union[Action, str],
        params: dict,
        entity_id: str = "default",
    ) -> t.Dict:
        """
        Execute an action on a given entity.

        :param action: Action to execute.
        :param params: The parameters to pass to the action.
        :param entity_id: The ID of the entity to execute the action on. Defaults to "default".
            Any: The output of the action execution.
        :return: Output object from the function call.
        """
        if isinstance(action, str):
            action = Action(action)

        if action.is_local:
            return self._local_client.execute_local_action(
                action=action, request_data=params
            )

        output = self.client.get_entity(entity_id).execute(action=action, params=params)
        if not os.path.exists(
                Path.home()
                / LOCAL_CACHE_DIRECTORY_NAME
                / LOCAL_OUTPUT_FILE_DIRECTORY_NAME
            ):
            os.makedirs(
                Path.home()
                / LOCAL_CACHE_DIRECTORY_NAME
                / LOCAL_OUTPUT_FILE_DIRECTORY_NAME
            )
        if self.output_in_file:
            output_file_path = (
                Path.home()
                / LOCAL_CACHE_DIRECTORY_NAME
                / LOCAL_OUTPUT_FILE_DIRECTORY_NAME
                / f"{action.name}_{entity_id}_{time.time()}"
            )
            with open(output_file_path, "w", encoding="utf-8") as file:
                file.write(str(output))
                return {"output_file": f"{output_file_path}"}
        
        try:
            print(f"trying to check file response")
            successResponseModel = SuccessExecuteActionResponseModel.model_validate(output)
            resp_data = json.loads(successResponseModel.response_data)
            for key, val in resp_data.items():
                print(f"Checking key: {key} is a file")
                try:
                    fileModel = FileModel.model_validate(val)
                    output_file_path = (
                        Path.home()
                        / LOCAL_CACHE_DIRECTORY_NAME
                        / LOCAL_OUTPUT_FILE_DIRECTORY_NAME
                        / f"{action.name}_{entity_id}_{time.time()}_{fileModel.name.replace('/', '_')}"
                    )
                    print(f"Saving file to: {output_file_path}")
                    with open(output_file_path, "wb") as file:
                        file.write(base64.b64decode(fileModel.content))
                    resp_data[key] = str(output_file_path)
                except Exception as e:
                    print(f"Error saving file: {e}")
                    pass
            output = json.dumps(resp_data)
        except Exception as e:
            print(f"Error checking file response: {e}")
            pass
        return output

    def get_action_schemas(
        self,
        apps: t.Optional[t.Sequence[App]] = None,
        actions: t.Optional[t.Sequence[Action]] = None,
        tags: t.Optional[t.Sequence[t.Union[str, Tag]]] = None,
    ) -> t.List[ActionModel]:
        local_actions = (
            [action for action in actions if action.is_local] if actions else []
        )
        remote_actions = (
            [action for action in actions if not action.is_local] if actions else []
        )
        local_apps = [app for app in apps if app.is_local] if apps else []
        remote_apps = [app for app in apps if not app.is_local] if apps else []

        items: t.List[ActionModel] = []
        if len(local_actions) > 0 or len(local_apps) > 0:
            local_items = self._local_client.get_list_of_action_schemas(
                apps=local_apps, actions=local_actions, tags=tags
            )
            items = items + [ActionModel(**item) for item in local_items]

        if len(remote_actions) > 0 or len(remote_apps) > 0:
            remote_items = self.client.actions.get(
                apps=remote_apps, actions=remote_actions, tags=tags
            )
            items = items + remote_items

        return items
