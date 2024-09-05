"""
Composio SDK tools.
"""

import base64
import binascii
import hashlib
import itertools
import json
import os
import time
import typing as t
import warnings
from functools import wraps
from importlib.util import find_spec
from pathlib import Path

import typing_extensions as te
from pydantic import BaseModel
from pydantic.v1.main import BaseModel as V1BaseModel

from composio import Action, ActionType, App, AppType, TagType
from composio.client import Composio, Entity
from composio.client.collections import (
    ActionModel,
    AppAuthScheme,
    ConnectedAccountModel,
    FileType,
    SuccessExecuteActionResponseModel,
    TriggerSubscription,
)
from composio.client.enums.base import EnumStringNotFound
from composio.client.exceptions import ComposioClientError
from composio.constants import (
    DEFAULT_ENTITY_ID,
    ENV_COMPOSIO_API_KEY,
    LOCAL_CACHE_DIRECTORY,
    LOCAL_OUTPUT_FILE_DIRECTORY_NAME,
    USER_DATA_FILE_NAME,
)
from composio.exceptions import ApiKeyNotProvidedError, ComposioSDKError
from composio.storage.user import UserData
from composio.tools.base.local import LocalAction
from composio.tools.env.base import (
    ENV_GITHUB_ACCESS_TOKEN,
    Workspace,
    WorkspaceConfigType,
)
from composio.tools.env.factory import HostWorkspaceConfig, WorkspaceFactory
from composio.tools.local import load_local_tools
from composio.tools.local.handler import LocalClient
from composio.utils.enums import get_enum_key
from composio.utils.logging import LogLevel, WithLogger
from composio.utils.url import get_api_url_base


T = te.TypeVar("T")
P = te.ParamSpec("P")

_KeyType = t.Union[AppType, ActionType]
_ProcessorType = t.Callable[[t.Dict], t.Dict]

MetadataType = t.Dict[_KeyType, t.Dict]
ParamType = t.TypeVar("ParamType")


class ProcessorsType(te.TypedDict):
    """Request and response processors."""

    pre: te.NotRequired[t.Dict[_KeyType, _ProcessorType]]
    """Request processors."""

    post: te.NotRequired[t.Dict[_KeyType, _ProcessorType]]
    """Response processors."""


def _check_agentops() -> bool:
    """Check if AgentOps is installed and initialized."""
    if find_spec("agentops") is None:
        return False
    import agentops  # pylint: disable=import-outside-toplevel # type: ignore

    return agentops.get_api_key() is not None


def _record_action_if_available(func: t.Callable[P, T]) -> t.Callable[P, T]:
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        if _check_agentops():
            import agentops  # pylint: disable=import-outside-toplevel # type: ignore

            action_name = str(kwargs.get("action", "unknown_action"))
            return agentops.record_action(action_name)(func)(self, *args, **kwargs)
        return func(self, *args, **kwargs)  # type: ignore

    return wrapper  # type: ignore


class ComposioToolSet(WithLogger):
    """Composio toolset."""

    _connected_accounts: t.Optional[t.List[ConnectedAccountModel]] = None
    _remote_client: t.Optional[Composio] = None
    _workspace: t.Optional[Workspace] = None

    _runtime: str = "composio"
    _description_char_limit: int = 1024

    def __init_subclass__(
        cls,
        runtime: t.Optional[str] = None,
        description_char_limit: t.Optional[int] = None,
    ) -> None:
        if runtime is None:
            warnings.warn(
                f"runtime is not set on {cls.__name__}, using 'composio' as default"
            )
        cls._runtime = runtime or "composio"

        if description_char_limit is None:
            warnings.warn(
                f"description_char_limit is not set on {cls.__name__}, using 1024 as default"
            )
        cls._description_char_limit = description_char_limit or 1024

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        entity_id: str = DEFAULT_ENTITY_ID,
        workspace_id: t.Optional[str] = None,
        workspace_config: t.Optional[WorkspaceConfigType] = None,
        metadata: t.Optional[MetadataType] = None,
        processors: t.Optional[ProcessorsType] = None,
        output_in_file: bool = False,
        logging_level: LogLevel = LogLevel.INFO,
        output_dir: t.Optional[Path] = None,
        verbosity_level: t.Optional[int] = None,
        **kwargs: t.Any,
    ) -> None:
        """
        Initialize composio toolset

        :param api_key: Composio API key
        :param base_url: Base URL for the Composio API server
        :param runtime: Name of the framework runtime, eg. openai, crewai...
        :param output_in_file: Whether to output the result to a file.
        :param entity_id: The ID of the entity to execute the action on.
            Defaults to "default".
        :param workspace_env: Environment where actions should be executed,
            you can choose from `host`, `docker`, `flyio` and `e2b`.
        :param workspace_id: Workspace ID for loading an existing workspace
        :param metadata: Additional metadata for executing an action or an
            action which belongs to a specific app. The additional metadata
            needs to be JSON serialisable dictionary. For example

            ```python
            toolset = ComposioToolset(
                ...,
                metadata={
                    App.IMAGEANALYSER: {
                        "base_url": "https://image.analyser/api",
                    },
                    Action.IMAGEANALYSER_GTP4:{
                        "openai_api_key": "sk-proj-somekey",
                    }
                }
            )
            ```
        :param processors: Request and response processors, use these to
            pre-process requests before executing an action and post-process
            the response after an action has been executed. The processors can
            be defined at app and action level. The order of execution will be

            `App pre-processor -> Action pre-processor -> execute action -> Action post-processor -> App post-processor`

            Heres and example of a request pre-processor

            ```python
            def _add_cwd_if_missing(request: t.Dict) -> t.Dict:
                if "cwd" not in request:
                    request["cwd"] = "~/project"
                return request

            def _sanitise_file_search_request(request: t.Dict) -> t.Dict:
                if ".tox" not in request["exclude"]:
                    request["exclude"].append(".tox")
                return request

            def _limit_file_search_response(response: t.Dict) -> t.Dict:
                if len(response["results"]) > 100:
                    response["results"] = response["results"][:100]
                return response

            toolset = ComposioToolset(
                ...,
                processors={
                    "pre": {
                        App.FILETOOL: _add_cwd_if_missing,
                        Action.FILETOOL_SEARCH: _sanitise_file_search_request,
                    },
                    "post": {
                        Action.FILETOOL_SEARCH: _limit_file_search_response,
                    }
                }
            )
            ```
        :param verbosity_level: This defines the size of the log object that will
            be printed on the console.

        """
        super().__init__(
            logging_level=logging_level,
            verbosity_level=verbosity_level,
        )
        self.logger.info(
            f"Logging is set to {self._logging_level}, "
            "use `logging_level` argument or "
            "`COMPOSIO_LOGGING_LEVEL` change this"
        )
        self.entity_id = entity_id
        self.output_in_file = output_in_file
        self.base_url = base_url or get_api_url_base()
        self.output_dir = (
            output_dir or LOCAL_CACHE_DIRECTORY / LOCAL_OUTPUT_FILE_DIRECTORY_NAME
        )
        self._ensure_output_dir_exists()

        try:
            self.api_key = (
                api_key
                or os.environ.get(ENV_COMPOSIO_API_KEY)
                or UserData.load(LOCAL_CACHE_DIRECTORY / USER_DATA_FILE_NAME).api_key
            )
        except FileNotFoundError:
            self.logger.debug("`api_key` is not set when initializing toolset.")

        self._processors = (
            processors if processors is not None else {"post": {}, "pre": {}}
        )
        self._metadata = metadata or {}
        self._workspace_id = workspace_id
        self._workspace_config = workspace_config
        self._local_client = LocalClient()

        if len(kwargs) > 0:
            self.logger.info(f"Extra kwards while initializing toolset: {kwargs}")

        self.logger.debug("Loading local tools")
        load_local_tools()

    def _try_get_github_access_token_for_current_entity(self) -> t.Optional[str]:
        """Try and get github access token for current entiry."""
        from_env = os.environ.get(f"_COMPOSIO_{ENV_GITHUB_ACCESS_TOKEN}")
        if from_env is not None:
            self.logger.debug("Using composio github access token")
            return from_env

        self.logger.debug(f"Trying to get github access token for {self.entity_id=}")
        try:
            account = self.client.get_entity(id=self.entity_id).get_connection(
                app=App.GITHUB
            )
            token = (
                self.client.connected_accounts.get(connection_id=account.id)
                .connectionParams.headers["Authorization"]  # type: ignore
                .replace("Bearer ", "")
            )
            self.logger.debug(
                f"Using `{token}` with scopes: {account.connectionParams.scope}"
            )
            return token
        except ComposioClientError:
            return None

    @property
    def workspace(self) -> Workspace:
        """Workspace for this toolset instance."""
        if self._workspace is not None:
            return self._workspace

        if self._workspace_id is not None:
            self._workspace = WorkspaceFactory.get(id=self._workspace_id)
            return self._workspace

        workspace_config = self._workspace_config or HostWorkspaceConfig()
        if workspace_config.composio_api_key is None:
            workspace_config.composio_api_key = self.api_key

        if workspace_config.composio_base_url is None:
            workspace_config.composio_base_url = self.base_url

        if workspace_config.github_access_token is None:
            workspace_config.github_access_token = (
                self._try_get_github_access_token_for_current_entity()
            )

        self._workspace = WorkspaceFactory.new(config=workspace_config)
        return self._workspace

    def set_workspace_id(self, workspace_id: str) -> None:
        self._workspace_id = workspace_id
        if self._workspace is not None:
            self._workspace = WorkspaceFactory.get(id=workspace_id)

    @property
    def client(self) -> Composio:
        if self.api_key is None:
            raise ApiKeyNotProvidedError()

        if self._remote_client is None:
            self._remote_client = Composio(
                api_key=self.api_key,
                base_url=self.base_url,
                runtime=self._runtime,
            )
            self._remote_client.local = self._local_client

        return self._remote_client

    def check_connected_account(self, action: ActionType) -> None:
        """Check if connected account is required and if required it exists or not."""
        action = Action(action)
        if action.no_auth or action.is_runtime:
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
                f"Run `composio add {action.app.lower()}` to fix this"
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
        connected_account_id: t.Optional[str] = None,
        text: t.Optional[str] = None,
    ) -> t.Dict:
        """Execute a remote action."""
        self.check_connected_account(action=action)
        output = self.client.get_entity(id=entity_id).execute(
            action=action,
            params=params,
            text=text,
            connected_account_id=connected_account_id,
        )
        if self.output_in_file:
            return self._write_to_file(
                action=action,
                output=output,
                entity_id=entity_id,
            )

        try:
            self.logger.debug("Trying to validate success response model")
            success_response_model = SuccessExecuteActionResponseModel.model_validate(
                output
            )
        except Exception:
            self.logger.debug("Failed to validate success response model")
            return output

        return self._save_var_files(
            file_name_prefix=f"{action.name}_{entity_id}_{time.time()}",
            success_response_model=success_response_model,
        )

    def _ensure_output_dir_exists(self):
        """Ensure the output directory exists."""
        if not self.output_dir.exists():
            self.output_dir.mkdir(parents=True, exist_ok=True)

    def _save_var_files(
        self,
        file_name_prefix: str,
        success_response_model: SuccessExecuteActionResponseModel,
    ) -> dict:
        error = success_response_model.error
        resp_data = success_response_model.data
        is_invalid_file = False
        for key, val in resp_data.items():
            try:
                file_model = FileType.model_validate(val)
                self._ensure_output_dir_exists()

                local_filepath = (
                    self.output_dir
                    / f"{file_name_prefix}_{file_model.name.replace('/', '_')}"
                )

                _write_file(
                    local_filepath, base64.urlsafe_b64decode(file_model.content)
                )

                resp_data[key] = str(local_filepath)
            except binascii.Error:
                is_invalid_file = True
                resp_data[key] = "Invalid File! Unable to decode."
            except Exception:
                pass

        if is_invalid_file is True and error is None:
            success_response_model.error = "Execution failed"
        success_response_model.data = resp_data
        return success_response_model.model_dump()

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
        self._ensure_output_dir_exists()
        outfile = self.output_dir / filename
        self.logger.info(f"Writing output to: {outfile}")
        _write_file(outfile, json.dumps(output))
        return {
            "message": f"output written to {outfile.resolve()}",
            "file": str(outfile.resolve()),
        }

    def _serialize_execute_params(self, param: ParamType) -> ParamType:
        """Returns a serialized version of the parameters object."""
        if param is None:
            return param  # type: ignore

        if isinstance(param, (int, float, str, bool)):
            return param  # type: ignore

        if isinstance(param, BaseModel):
            return param.model_dump_json(exclude_none=True)  # type: ignore

        if isinstance(param, V1BaseModel):
            return param.dict(exclude_none=True)  # type: ignore

        if isinstance(param, list):
            return [self._serialize_execute_params(p) for p in param]  # type: ignore

        if isinstance(param, dict):
            return {key: self._serialize_execute_params(val) for key, val in param.items()}  # type: ignore

        raise ValueError(
            "Invalid value found for execute parameters"
            f"\ntype={type(param)} \nvalue={param}"
        )

    def _get_metadata(self, key: _KeyType) -> t.Dict:
        metadata = self._metadata.get(key)  # type: ignore
        if metadata is not None:
            return metadata

        try:
            return self._metadata.get(Action(t.cast(ActionType, key)), {})  # type: ignore
        except EnumStringNotFound:
            return self._metadata.get(App(t.cast(AppType, key)), {})  # type: ignore

    def _add_metadata(self, action: Action, metadata: t.Optional[t.Dict]) -> t.Dict:
        metadata = metadata or {}
        metadata.update(self._get_metadata(key=App(action.app)))
        metadata.update(self._get_metadata(key=action))
        return metadata

    def _get_processor(
        self,
        key: _KeyType,
        type_: te.Literal["post", "pre"],
    ) -> t.Optional[_ProcessorType]:
        """Get processor for given app or action"""
        processor = self._processors.get(type_, {}).get(key)  # type: ignore
        if processor is not None:
            return processor

        try:
            return self._processors.get(type_, {}).get(Action(t.cast(ActionType, key)))  # type: ignore
        except EnumStringNotFound:
            return self._processors.get(type_, {}).get(App(t.cast(AppType, key)))  # type: ignore

    def _process(
        self,
        key: _KeyType,
        data: t.Dict,
        type_: te.Literal["pre", "post"],
    ) -> t.Dict:
        processor = self._get_processor(key=key, type_=type_)
        if processor is not None:
            self.logger.info(
                f"Running {'request' if type_ == 'pre' else 'response'}"
                f" through: {processor.__name__}"
            )
            data = processor(data)
        return data

    def _process_request(self, action: Action, request: t.Dict) -> t.Dict:
        return self._process(
            key=action,
            data=self._process(
                key=App(action.app),
                data=request,
                type_="pre",
            ),
            type_="pre",
        )

    def _process_respone(self, action: Action, response: t.Dict) -> t.Dict:
        return self._process(
            key=App(action.app),
            data=self._process(
                key=action,
                data=response,
                type_="post",
            ),
            type_="post",
        )

    @_record_action_if_available
    def execute_action(
        self,
        action: ActionType,
        params: dict,
        metadata: t.Optional[t.Dict] = None,
        entity_id: str = DEFAULT_ENTITY_ID,
        connected_account_id: t.Optional[str] = None,
        text: t.Optional[str] = None,
    ) -> t.Dict:
        """
        Execute an action on a given entity.

        :param action: Action to execute
        :param params: The parameters to pass to the action
        :param entity_id: The ID of the entity to execute the action on. Defaults to "default"
        :param text: Extra text to use for generating function calling metadata
        :param metadata: Metadata for executing local action
        :param connected_account_id: Connection ID for executing the remote action
        :return: Output object from the function call
        """
        action = Action(action)
        params = self._serialize_execute_params(param=params)
        if not action.is_runtime:
            params = self._process_request(action=action, request=params)
            metadata = self._add_metadata(action=action, metadata=metadata)

        self.logger.info(f"Executing `{action.slug}` with {params=} and {metadata=}")
        response = (
            self._execute_local(
                action=action,
                params=params,
                metadata=metadata,
            )
            if action.is_local
            else self._execute_remote(
                action=action,
                params=params,
                entity_id=entity_id,
                connected_account_id=connected_account_id,
                text=text,
            )
        )
        response = (
            response
            if action.is_runtime
            else self._process_respone(action=action, response=response)
        )
        self.logger.info(f"Got {response=} from {action=} with {params=}")
        return response

    def validate_tools(
        self,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> None:
        # NOTE: This an experimental, can convert to decorator for more convinience
        if not apps and not actions and not tags:
            return
        self.workspace.check_for_missing_dependencies(
            apps=apps,
            actions=actions,
            tags=tags,
        )

    def get_action_schemas(
        self,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> t.List[ActionModel]:
        runtime_actions = t.cast(
            t.List[t.Type[LocalAction]],
            [action for action in actions or [] if hasattr(action, "run_on_shell")],
        )
        actions = t.cast(
            t.List[Action],
            [
                Action(action)
                for action in actions or []
                if action not in runtime_actions
            ],
        )
        apps = t.cast(t.List[App], [App(app) for app in apps or []])
        items: t.List[ActionModel] = []

        local_actions = [action for action in actions if action.is_local]
        local_apps = [app for app in apps if app.is_local]
        if len(local_actions) > 0 or len(local_apps) > 0:
            items += [
                ActionModel(**item)
                for item in self._local_client.get_action_schemas(
                    apps=local_apps,
                    actions=local_actions,
                    tags=tags,
                )
            ]

        remote_actions = [action for action in actions if not action.is_local]
        remote_apps = [app for app in apps if not app.is_local]
        if len(remote_actions) > 0 or len(remote_apps) > 0:
            remote_items = self.client.actions.get(
                apps=remote_apps,
                actions=remote_actions,
                tags=tags,
            )
            for item in remote_items:
                self.check_connected_account(action=item.name)
            items = items + remote_items

        for act in runtime_actions:
            schema = act.schema()
            schema["name"] = act.enum
            items.append(ActionModel(**schema))

        for item in items:
            item = self._process_schema(item)

        return items

    def _process_schema(self, action_item: ActionModel) -> ActionModel:
        required_params = action_item.parameters.required or []
        for param_name, param_details in action_item.parameters.properties.items():
            if param_details.get("properties") == FileType.schema().get("properties"):
                action_item.parameters.properties[param_name].pop("properties")
                action_item.parameters.properties[param_name] = {
                    "default": param_details.get("default"),
                    "type": "string",
                    "format": "file-path",
                    "description": f"File path to {param_details.get('description', '')}",
                }
            elif param_details.get("allOf", [{}])[0].get(
                "properties"
            ) == FileType.schema().get("properties"):
                action_item.parameters.properties[param_name].pop("allOf")
                action_item.parameters.properties[param_name].update(
                    {
                        "default": param_details.get("default"),
                        "type": "string",
                        "format": "file-path",
                        "description": f"File path to {param_details.get('description', '')}",
                    }
                )
            elif param_details.get("type") in [
                "string",
                "integer",
                "number",
                "boolean",
            ]:
                param_type = param_details["type"]
                description = param_details.get("description", "").rstrip(".")
                if description:
                    param_details[
                        "description"
                    ] = f"{description}. Please provide a value of type {param_type}."
                else:
                    param_details[
                        "description"
                    ] = f"Please provide a value of type {param_type}."

            if param_name in required_params:
                description = param_details.get("description", "")
                if description:
                    param_details[
                        "description"
                    ] = f"{description.rstrip('.')}. This parameter is required."
                else:
                    param_details["description"] = "This parameter is required."

        if action_item.description is not None:
            action_item.description = action_item.description[
                : self._description_char_limit
            ]

        return action_item

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

    def get_agent_instructions(
        self,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> str:
        """
        Generate a formatted string with instructions for agents based on the provided apps, actions, and tags.

        This function compiles a list of available tools from the specified apps, actions, and tags,
        and formats them into a human-readable string that can be used as instructions for agents.

        :param apps: Optional sequence of AppType to include in the search.
        :param actions: Optional sequence of ActionType to include in the search.
        :param tags: Optional sequence of TagType to filter the actions.
        :return: A formatted string with instructions for agents.
        """
        # Retrieve schema information for the given apps, actions, and tags
        schema_list = [
            schema.model_dump()
            for schema in (
                self.get_action_schemas(apps=apps, tags=tags)
                + self.get_action_schemas(actions=actions)
            )
        ]
        schema_info = [
            (schema_obj["appName"], schema_obj["name"]) for schema_obj in schema_list
        ]

        # Helper function to format a list of items into a string
        def format_list(items):
            if not items:
                return ""
            if len(items) == 1:
                return items[0]
            return ", ".join(items[:-2] + [" and ".join(items[-2:])])

        # Organize the schema information by app name
        action_dict: t.Dict[str, t.List] = {}
        for appName, name in schema_info:
            if appName not in action_dict:
                action_dict[appName] = []
            action_dict[appName].append(name)

        # Format the schema information into a human-readable string
        formatted_schema_info = (
            "You have various tools, among which "
            + ", ".join(
                [
                    f"for interacting with **{appName}** you might use {format_list(action_items)} tools"
                    for appName, action_items in action_dict.items()
                ]
            )
            + ". Whichever tool is useful to execute your task, use that with proper parameters."
        )
        return formatted_schema_info

    def get_auth_schemes(self, app: AppType) -> t.List[AppAuthScheme]:
        """Get the list of auth schemes for an app."""
        return self.client.apps.get(name=str(app)).auth_schemes or []

    def get_entity(self, id: t.Optional[str] = None) -> Entity:
        """Get entity object for given ID."""
        return self.client.get_entity(id=id or self.entity_id)


def _write_file(file_path: t.Union[str, os.PathLike], content: t.Union[str, bytes]):
    """Write content to a file."""
    if isinstance(content, str):
        with open(file_path, "w", encoding="utf-8") as file:
            file.write(content)
    else:
        with open(file_path, "wb") as file:
            file.write(content)
