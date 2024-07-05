"""
Composio SDK tools.
"""

import base64
import hashlib
import itertools
import json
import os
import time
import typing as t
from pathlib import Path

from pydantic import BaseModel

from composio.client import Composio
from composio.client.collections import (
    ActionModel,
    ConnectedAccountModel,
    FileModel,
    SuccessExecuteActionResponseModel,
    TriggerSubscription,
)
from composio.client.enums import Action, ActionType, App, AppType, TagType
from composio.client.exceptions import ComposioClientError
from composio.constants import (
    DEFAULT_ENTITY_ID,
    ENV_COMPOSIO_API_KEY,
    LOCAL_CACHE_DIRECTORY,
    LOCAL_CACHE_DIRECTORY_NAME,
    USER_DATA_FILE_NAME,
)
from composio.exceptions import ApiKeyNotProvidedError, ComposioSDKError
from composio.storage.user import UserData
from composio.tools.env.factory import ExecEnv, WorkspaceFactory
from composio.tools.local.handler import LocalClient
from composio.utils.enums import get_enum_key
from composio.utils.logging import WithLogger


class ComposioToolSet(WithLogger):
    """Composio toolset."""

    _remote_client: t.Optional[Composio] = None
    _connected_accounts: t.Optional[t.List[ConnectedAccountModel]] = None

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        runtime: t.Optional[str] = None,
        output_in_file: bool = False,
        entity_id: str = DEFAULT_ENTITY_ID,
        workspace_env: ExecEnv = ExecEnv.DOCKER,
        workspace_id: t.Optional[str] = None,
    ) -> None:
        """
        Initialize composio toolset

        :param api_key: Composio API key
        :param base_url: Base URL for the Composio API server
        :param runtime: Name of the framework runtime, eg. openai, crewai...
        :param output_in_file: Whether to output the result to a file.
        :param entity_id: The ID of the entity to execute the action on. Defaults to "default".
        :param workspace_env: Environment where actions should be executed, you can choose from
                `host`, `docker`, `flyio` and `e2b`.
        :param workspace_id: Workspace ID for loading an existing workspace
        """
        super().__init__()
        self.entity_id = entity_id
        self.output_in_file = output_in_file
        self.base_url = base_url
        self.workspace_id = workspace_id
        self.workspace_env = workspace_env
        if self.workspace_id is None:
            self.logger.debug(
                f"Workspace ID not provided, using `{workspace_env}` "
                "to create a new workspace"
            )
            self.workspace = WorkspaceFactory.new(
                env=workspace_env,
            )
        else:
            self.logger.debug(f"Loading workspace with ID: {workspace_id}")
            self.workspace = WorkspaceFactory.get(
                id=self.workspace_id,
            )

        try:
            self.api_key = (
                api_key
                or os.environ.get(ENV_COMPOSIO_API_KEY)
                or UserData.load(
                    Path.home() / LOCAL_CACHE_DIRECTORY_NAME / USER_DATA_FILE_NAME
                ).api_key
            )
        except FileNotFoundError:
            self.logger.debug("`api_key` is not set when initializing toolset.")

        self._runtime = runtime
        self._local_client = LocalClient()

    @property
    def client(self) -> Composio:
        if self.api_key is None:
            raise ApiKeyNotProvidedError()

        if self._remote_client is None:
            self._remote_client = Composio(
                api_key=self.api_key,
                base_url=self.base_url,
                runtime=self.runtime,
            )
            self._remote_client.local = self._local_client

        return self._remote_client

    @property
    def runtime(self) -> t.Optional[str]:
        return self._runtime

    def check_connected_account(self, action: ActionType) -> None:
        """Check if connected account is required and if required it exists or not."""
        action = Action(action)
        if action.no_auth:
            return

        if self._connected_accounts is None:
            self._connected_accounts = t.cast(
                t.List[ConnectedAccountModel],
                self.client.connected_accounts.get(),
            )

        if action.app not in [
            connection.appUniqueId for connection in self._connected_accounts
        ]:
            raise ComposioSDKError(
                f"No connected account found for app `{action.app}`; "
                f"Run `composio add {action.app}` to fix this"
            )

    def _execute_local(
        self,
        action: Action,
        params: t.Dict,
        metadata: t.Optional[t.Dict] = None,
    ) -> t.Dict:
        """Execute a local action."""
        response = self.workspace.execute_action(
            action=action,
            request_data=params,
            metadata=metadata or {},
        )
        if isinstance(response, BaseModel):
            return response.model_dump()
        return response

    def _execute_remote(
        self,
        action: Action,
        params: t.Dict,
        entity_id: str = DEFAULT_ENTITY_ID,
        text: t.Optional[str] = None,
    ) -> t.Dict:
        """Execute a remote action."""
        self.check_connected_account(
            action=action,
        )
        output = self.client.get_entity(
            id=entity_id,
        ).execute(
            action=action,
            params=params,
            text=text,
        )
        if self.output_in_file:
            return self._write_to_file(
                action=action,
                output=output,
                entity_id=entity_id,
            )

        return self._write_file(
            action=action,
            output=output,
            entity_id=entity_id,
        )

    def _write_to_file(
        self,
        action: Action,
        output: t.Dict,
        entity_id: str = DEFAULT_ENTITY_ID,
    ) -> t.Dict:
        """Write output to a file."""
        filename = hashlib.sha256(
            f"{action.name}-{entity_id}-{time.time()}".encode()
        ).hexdigest()

        outdir = LOCAL_CACHE_DIRECTORY / "outputs"
        if not outdir.exists():
            outdir.mkdir()

        outfile = outdir / filename
        self.logger.info(f"Writing output to: {outfile}")

        outfile.write_text(
            data=json.dumps(output),
            encoding="utf-8",
        )
        return {
            "message": f"output written to {outfile.resolve()}",
            "file": str(outfile.resolve()),
        }

    def _write_file(
        self,
        action: Action,
        output: t.Dict,
        entity_id: str = DEFAULT_ENTITY_ID,
    ) -> dict:
        """If received object is a blob, write it to a file."""
        success_response_model = SuccessExecuteActionResponseModel.model_validate(
            output
        )
        files = json.loads(
            success_response_model.response_data,
        )
        outdir = (
            LOCAL_CACHE_DIRECTORY
            / "outputs"
            / hashlib.sha256(
                f"{action.name}-{entity_id}-{time.time()}".encode()
            ).hexdigest()
        )
        if not outdir.exists():
            outdir.mkdir()

        response = {}
        self.logger.info(f"Writing files to: {outdir}")
        for key, val in files.items():
            file = FileModel.model_validate(val)
            (outdir / file.name).write_bytes(data=base64.b64decode(file.content))
            response[key] = str(outdir / file.name)
        return response

    def execute_action(
        self,
        action: t.Union[Action, str],
        params: dict,
        metadata: t.Optional[t.Dict] = None,
        entity_id: str = DEFAULT_ENTITY_ID,
        text: t.Optional[str] = None,
    ) -> t.Dict:
        """
        Execute an action on a given entity.

        :param action: Action to execute
        :param params: The parameters to pass to the action
        :param entity_id: The ID of the entity to execute the action on. Defaults to "default"
        :param text: Extra text to use for generating function calling metadata
        :param metadata: Metadata for executing local action
        :return: Output object from the function call
        """
        action = Action(action)
        if action.is_local:
            return self._execute_local(
                action=action,
                params=params,
                metadata=metadata,
            )
        return self._execute_remote(
            action=action,
            params=params,
            entity_id=entity_id,
            text=text,
        )

    def get_action_schemas(
        self,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> t.List[ActionModel]:
        actions = t.cast(t.List[Action], [Action(action) for action in actions or []])
        apps = t.cast(t.List[App], [App(app) for app in apps or []])
        local_actions = [action for action in actions if action.is_local]
        remote_actions = [action for action in actions if not action.is_local]
        local_apps = [app for app in apps if app.is_local]
        remote_apps = [app for app in apps if not app.is_local]

        items: t.List[ActionModel] = []
        if len(local_actions) > 0 or len(local_apps) > 0:
            local_items = self._local_client.get_action_schemas(
                apps=local_apps,
                actions=local_actions,
                tags=tags,
            )
            items = items + [ActionModel(**item) for item in local_items]

        if len(remote_actions) > 0 or len(remote_apps) > 0:
            remote_items = self.client.actions.get(
                apps=remote_apps,
                actions=remote_actions,
                tags=tags,
            )
            items = items + remote_items

        for item in items:
            self.check_connected_account(action=item.name)
        return items

    def create_trigger_listener(self, timeout: float = 15.0) -> TriggerSubscription:
        """Create trigger subscription."""
        return self.client.triggers.subscribe(timeout=timeout)

    def find_actions_by_use_case(
        self,
        *apps: AppType,
        use_case: str,
    ) -> t.List[Action]:
        """
        Find actions by specified use case.

        :param apps: List of apps to search.
        :param use_case: String describing the use case.
        :return: A list of actions matching the relevant use case.
        """
        actions = self.client.actions.get(
            apps=[App(app) for app in apps],
            use_case=use_case,
            allow_all=True,
        )
        return [
            Action(value=get_enum_key(name=action.name).lower()) for action in actions
        ]

    def find_actions_by_tags(
        self,
        *apps: AppType,
        tags: t.List[str],
    ) -> t.List[Action]:
        """
        Find actions by specified use case.

        :param apps: List of apps to search.
        :param use_case: String describing the use case.
        :return: A list of actions matching the relevant use case.
        """
        if len(tags) == 0:
            raise ComposioClientError(
                "Please provide at least one tag to perform search"
            )

        if len(apps) > 0:
            return list(
                itertools.chain(
                    *[list(App(app).get_actions(tags=tags)) for app in apps]
                )
            )

        actions = []
        for action in Action.all():
            if any(tag in action.tags for tag in tags):
                actions.append(action)
        return actions
