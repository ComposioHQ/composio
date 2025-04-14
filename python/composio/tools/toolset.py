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
import uuid
import warnings
from datetime import datetime
from functools import wraps
from importlib.util import find_spec
from pathlib import Path

import typing_extensions as te
import yaml
from pydantic import BaseModel

from composio import Action, ActionType, App, AppType, TagType
from composio.client import Composio, Entity
from composio.client.collections import (
    ALL_AUTH_SCHEMES,
    AUTH_SCHEME_WITH_INITIATE,
    ActionModel,
    ActiveTriggerModel,
    AppAuthScheme,
    AppModel,
    AuthSchemeField,
    AuthSchemeType,
    ConnectedAccountModel,
    ConnectionParams,
    ConnectionRequestModel,
    CustomAuthObject,
    CustomAuthParameter,
    ExpectedFieldInput,
    FileType,
    IntegrationModel,
    SuccessExecuteActionResponseModel,
    TriggerConfigModel,
    TriggerModel,
    TriggerSubscription,
)
from composio.client.enums import TriggerType
from composio.client.exceptions import ComposioClientError, HTTPError, NoItemsFound
from composio.client.files import FileDownloadable, FileUploadable
from composio.client.utils import check_cache_refresh
from composio.constants import (
    DEFAULT_ENTITY_ID,
    ENV_COMPOSIO_API_KEY,
    LOCAL_CACHE_DIRECTORY,
    LOCAL_OUTPUT_FILE_DIRECTORY_NAME,
    LOCKFILE_PATH,
    USER_DATA_FILE_NAME,
    VERSION_LATEST,
)
from composio.exceptions import (
    ApiKeyNotProvidedError,
    ComposioSDKError,
    ConnectedAccountNotFoundError,
    EnumStringNotFound,
    ErrorFetchingResource,
    IntegrationError,
    InvalidConnectedAccount,
    InvalidLockFile,
    InvalidParams,
    ProcessorError,
    ResourceError,
    VersionSelectionError,
)
from composio.storage.user import UserData
from composio.tools.base.abs import action_registry, tool_registry
from composio.tools.env.base import (
    ENV_GITHUB_ACCESS_TOKEN,
    Workspace,
    WorkspaceConfigType,
)
from composio.tools.env.factory import HostWorkspaceConfig, WorkspaceFactory
from composio.tools.local import load_local_tools
from composio.tools.local.handler import LocalClient
from composio.utils import help_msg
from composio.utils.enums import get_enum_key
from composio.utils.logging import LogIngester, LogLevel, WithLogger
from composio.utils.url import get_api_url_base


T = te.TypeVar("T")
P = te.ParamSpec("P")

_KeyType = t.Union[AppType, ActionType]
_CallableType = t.Callable[[t.Dict], t.Dict]

MetadataType = t.Dict[_KeyType, t.Dict]
ParamType = t.TypeVar("ParamType")
ProcessorType = te.Literal["pre", "post", "schema"]

_IS_CI: t.Optional[bool] = None


class IntegrationParams(te.TypedDict):

    integration_id: str
    auth_scheme: str
    expected_params: t.List[ExpectedFieldInput]


class ProcessorsType(te.TypedDict):
    """Request and response processors."""

    pre: te.NotRequired[t.Dict[_KeyType, _CallableType]]
    """Request processors."""

    post: te.NotRequired[t.Dict[_KeyType, _CallableType]]
    """Response processors."""

    schema: te.NotRequired[t.Dict[_KeyType, _CallableType]]
    """Schema processors"""


def _check_agentops() -> bool:
    """Check if AgentOps is installed and initialized."""
    if find_spec("agentops") is None:
        return False
    import agentops  # pylint: disable=import-outside-toplevel # type: ignore

    return agentops.get_api_key() is not None


def _is_ci():
    global _IS_CI
    if _IS_CI is None:
        _IS_CI = os.environ.get("CI") == "true"
    return _IS_CI


def _record_action_if_available(func: t.Callable[P, T]) -> t.Callable[P, T]:
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        if _check_agentops():
            import agentops  # pylint: disable=import-outside-toplevel # type: ignore

            action_name = str(kwargs.get("action", "unknown_action"))
            return agentops.record_action(action_name)(func)(self, *args, **kwargs)
        return func(self, *args, **kwargs)  # type: ignore

    return wrapper  # type: ignore


def _map_enums(_t: t.Type[T], _sequence: t.Sequence[t.Any]) -> t.Sequence[T]:
    return list(map(_t, _sequence))


class _Retry:
    """Sentinel value to indicate that the processor should retry the action"""


RETRY = _Retry()


class VersionLock:
    """Lock file representing action->version mapping"""

    def __init__(self, path: t.Optional[Path] = None) -> None:
        self._path = path or LOCKFILE_PATH
        self._versions = self.__load()

    def __getitem__(self, action: ActionType) -> str:
        return self._versions[str(action)]

    def __setitem__(self, action: ActionType, version: str) -> None:
        self._versions[str(action)] = version

    def __contains__(self, action: ActionType) -> bool:
        return str(action) in self._versions

    def __load(self) -> t.Dict[str, str]:
        """Load tool versions from lockfile."""
        if not self._path.exists():
            return {}

        with open(self._path, encoding="utf-8") as file:
            versions = yaml.safe_load(file)

        if not isinstance(versions, dict):
            raise InvalidLockFile(
                f"Invalid lockfile format, expected dict, got {type(versions)}"
            )

        for tool in versions.values():
            if not isinstance(tool, str):
                raise InvalidLockFile(
                    f"Invalid lockfile format, expected version to be string, got {tool!r}"
                )

        return versions

    def __store(self) -> None:
        """Store tool versions to lockfile."""
        with open(self._path, "w", encoding="utf-8") as file:
            yaml.safe_dump(self._versions, file)

    set = __setitem__

    def update(
        self,
        versions: t.Optional[t.Dict[str, str]] = None,
        override: bool = False,
        **_versions: str,
    ):
        for action, version in {**(versions or {}), **_versions}.items():
            if action in self._versions and not override:
                continue
            self._versions[action] = version

    def _apply(self, action: Action) -> Action:
        if action not in self:
            if action.is_version_set:
                self[action] = action.version
            return action

        if action.is_version_set:
            if action.version == self[action]:
                return action

            raise VersionSelectionError(
                action=action.slug,
                requested=action.version,
                locked=self[action],
            )

        return action @ self[action]

    def apply(self, actions: t.List[Action]) -> t.List[Action]:
        return list(map(self._apply, actions))

    def get(self, action: ActionType) -> t.Optional[str]:
        return self._versions.get(str(action))

    def lock(self) -> None:
        self.__store()


class ProcessorHelper(WithLogger):

    __processors: ProcessorsType
    __metadata: MetadataType

    def __init__(self, metadata: MetadataType) -> None:
        super().__init__()
        self.__processors = {"post": {}, "pre": {}, "schema": {}}
        self.__metadata = metadata

    def merge_processors(self, processors: ProcessorsType) -> None:
        for ptype in t.cast(t.Iterator[ProcessorType], self.__processors.keys()):
            if ptype not in processors:
                continue

            if ptype not in self.__processors:
                self.__processors[ptype] = {}
            self.__processors[ptype].update(processors[ptype])  # type: ignore

    def _get_processor(
        self,
        key: _KeyType,
        type_: te.Literal["post", "pre", "schema"],
    ) -> t.Optional[_CallableType]:
        """Get processor for given app or action"""
        processor = self.__processors.get(type_, {}).get(key)  # type: ignore
        if processor is not None:
            return processor

        try:
            return self.__processors.get(type_, {}).get(Action(t.cast(ActionType, key)))  # type: ignore
        except EnumStringNotFound:
            return self.__processors.get(type_, {}).get(App(t.cast(AppType, key)))  # type: ignore

    def _process(
        self,
        key: _KeyType,
        data: t.Dict,
        type_: te.Literal["pre", "post", "schema"],
    ) -> t.Union[t.Dict, _Retry]:
        processor = self._get_processor(key=key, type_=type_)
        if processor is not None:
            self.logger.debug(
                f"Running {'request' if type_ == 'pre' else 'response' if type_ == 'post' else 'schema'}"
                f" through: {processor.__name__}"
            )
            data = processor(data)
            # Users may not respect our type annotations and return something that isn't a dict.
            # If that happens we should show a friendly error message.
            if not isinstance(data, t.Dict):
                warnings.warn(
                    f"Expected {type_}-processor to return 'dict', got {type(data).__name__!r}",
                    stacklevel=2,
                )
        return data

    def process_request(self, action: Action, request: t.Dict) -> t.Dict:
        processed = self._process(
            key=App(action.app),
            data=request,
            type_="pre",
        )
        if isinstance(processed, _Retry):
            raise ProcessorError(
                "Received RETRY from App preprocessor function."
                " Preprocessors cannot be retried."
            )

        processed = self._process(
            key=action,
            data=processed,
            type_="pre",
        )
        if isinstance(processed, _Retry):
            raise ProcessorError(
                "Received RETRY from Action preprocessor function."
                " Preprocessors cannot be retried."
            )

        return processed

    def process_respone(
        self, action: Action, response: t.Dict
    ) -> t.Union[t.Dict, _Retry]:
        processed = self._process(
            key=App(action.app),
            data=response,
            type_="post",
        )
        if isinstance(processed, _Retry):
            return RETRY

        processed = self._process(
            key=action,
            data=processed,
            type_="post",
        )
        if isinstance(processed, _Retry):
            return RETRY

        return processed

    def process_schema_properties(self, action: Action, properties: t.Dict) -> t.Dict:
        processed = self._process(
            key=App(action.app),
            data=properties,
            type_="schema",
        )
        if isinstance(processed, _Retry):
            raise ProcessorError(
                "Received RETRY from App schema processor function."
                " Schema pprocessors cannot be retried."
            )

        processed = self._process(
            key=action,
            data=processed,
            type_="schema",
        )
        if isinstance(processed, _Retry):
            raise ProcessorError(
                "Received RETRY from Action preprocessor function."
                " Schema processors cannot be retried."
            )
        return processed

    def _get_metadata(self, key: _KeyType) -> t.Dict:
        metadata = self.__metadata.get(key)  # type: ignore
        if metadata is not None:
            return metadata

        try:
            return self.__metadata.get(Action(t.cast(ActionType, key)), {})  # type: ignore
        except EnumStringNotFound:
            return self.__metadata.get(App(t.cast(AppType, key)), {})  # type: ignore

    def add_metadata(self, action: Action, metadata: t.Optional[t.Dict]) -> t.Dict:
        metadata = metadata or {}
        metadata.update(self._get_metadata(key=App(action.app)))
        metadata.update(self._get_metadata(key=action))
        return metadata


class FileIOHelper(WithLogger):

    def __init__(self, outdir: t.Optional[Path] = None) -> None:
        super().__init__()
        self.outdir = outdir or LOCAL_CACHE_DIRECTORY / LOCAL_OUTPUT_FILE_DIRECTORY_NAME
        self.outdir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _write_file(path: t.Union[str, os.PathLike], content: t.Union[str, bytes]):
        """Write content to a file."""
        if isinstance(content, str):
            with open(path, "w", encoding="utf-8") as file:
                file.write(content)
                return

        with open(path, "wb") as file:
            file.write(content)

    def write_output(
        self,
        action: Action,
        output: t.Dict,
        entity_id: str = DEFAULT_ENTITY_ID,
    ) -> t.Dict:
        """Write output to a file."""
        filename = hashlib.sha256(
            f"{action.name}-{entity_id}-{time.time()}".encode()
        ).hexdigest()

        outfile = self.outdir / filename
        self.logger.debug(f"Writing output to: {outfile}")
        self._write_file(outfile, json.dumps(output))
        return {
            "message": f"output written to {outfile.resolve()}",
            "file": str(outfile.resolve()),
        }

    def write_downloadable(
        self,
        prefix: str,
        response_model: SuccessExecuteActionResponseModel,
    ) -> dict:
        error = response_model.error
        resp_data = response_model.data
        is_invalid_file = False
        for key, val in resp_data.items():
            try:
                file_model = FileType.model_validate(val)
                local_filepath = (
                    self.outdir / f"{prefix}_{file_model.name.replace('/', '_')}"
                )
                self._write_file(
                    path=local_filepath,
                    content=base64.urlsafe_b64decode(file_model.content),
                )
                resp_data[key] = str(local_filepath)
            except binascii.Error:
                is_invalid_file = True
                resp_data[key] = "Invalid File! Unable to decode."
            except Exception:
                pass

        if is_invalid_file is True and error is None:
            response_model.error = "Execution failed"
        response_model.data = resp_data
        return response_model.model_dump()


class SchemaHelper(WithLogger):

    def __init__(self, client: t.Callable[[], Composio]):
        super().__init__()
        self._client = client
        self._local_client = LocalClient()
        self._schema_cache: dict[str, ActionModel] = {}

    @property
    def client(self) -> Composio:
        return self._client()

    def get_runtime_action_schemas(
        self, actions: t.List[Action]
    ) -> t.List[ActionModel]:
        items: list[ActionModel] = []
        for action in actions:
            if not action.is_runtime:
                continue

            _action = action_registry["runtime"][action.slug]
            schema = _action.schema()
            schema["name"] = _action.enum
            items.append(
                ActionModel(
                    **schema,
                    version=VERSION_LATEST,
                    available_versions=[VERSION_LATEST],
                ).model_copy(deep=True)
            )
        self._schema_cache.update({item.name: item.model_copy() for item in items})
        return items

    def get_local_action_schemas(
        self,
        apps: t.List[App],
        actions: t.List[Action],
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> t.List[ActionModel]:
        actions = [
            action for action in actions if action.is_local and not action.is_runtime
        ]
        apps = [app for app in apps if app.is_local]
        if len(actions) == 0 and len(apps) == 0:
            return []

        items = [
            ActionModel(
                **item,
                version=VERSION_LATEST,
                available_versions=[VERSION_LATEST],
            )
            for item in self._local_client.get_action_schemas(
                apps=apps,
                actions=actions,
                tags=tags,
            )
        ]
        self._schema_cache.update({item.name: item.model_copy() for item in items})
        return items

    def get_remote_actions_schemas(
        self,
        apps: t.List[App],
        actions: t.List[Action],
        tags: t.Optional[t.Sequence[TagType]] = None,
        check_connected_account: t.Optional[t.Callable] = None,
    ) -> t.List[ActionModel]:
        actions = [action for action in actions if not action.is_local]
        apps = [app for app in apps if not app.is_local]
        if len(actions) == 0 and len(apps) == 0:
            return []

        versioned_actions = [a for a in actions if a.is_version_set]
        none_versioned_actions = [a for a in actions if not a.is_version_set]
        items = [self.client.actions.get(a) for a in versioned_actions]
        if len(none_versioned_actions) > 0 or len(apps) > 0:
            items += self.client.actions.get(
                apps=apps,
                actions=none_versioned_actions,
                tags=tags,
            )

        self._schema_cache.update({item.name: item.model_copy() for item in items})
        if check_connected_account is None:
            warnings.warn(
                "Not verifying connected accounts for apps."
                " Actions may fail when the Agent tries to use them.",
                UserWarning,
            )
            return items

        for item in items:
            check_connected_account(action=item.name)

        return items

    def _file_uploadable(self, schema: t.Dict):
        if "allOf" in schema:
            return any(
                (
                    _schema.get("file_uploadable", False)
                    if isinstance(_schema, dict)
                    else False
                )
                for _schema in schema["allOf"]
            )
        return schema.get("file_uploadable", False)

    def _process_file_uploadable(self, schema: t.Dict):
        return {
            "type": "string",
            "format": "path",
            "description": schema.get("description", "Path to file."),
            "title": schema.get("title"),
        }

    def _process_schema_recursively(self, schema: t.Dict) -> t.Dict:
        required = schema.get("required") or []
        for _param, _schema in schema["properties"].items():
            if self._file_uploadable(schema=_schema):
                schema["properties"][_param] = self._process_file_uploadable(
                    schema=_schema
                )

            if _schema.get("type") in ["string", "integer", "number", "boolean"]:
                ext = f'Please provide a value of type {_schema["type"]}.'
                description = _schema.get("description", "").rstrip(".")
                _schema["description"] = f"{description}. {ext}" if description else ext

            if _param in required:
                description = _schema.get("description", "")
                if description:
                    _schema["description"] = (
                        f"{description.rstrip('.')}. This parameter is required."
                    )

                else:
                    _schema["description"] = "This parameter is required."

        return schema

    def process_schema(
        self,
        action: ActionModel,
        processor_helper: ProcessorHelper,
        description_char_limit: int,
        action_name_char_limit: t.Optional[int] = None,
    ) -> ActionModel:
        action.parameters = action.parameters.model_validate(
            obj=self._process_schema_recursively(
                schema=action.parameters.model_dump(),
            )
        )
        action.response = action.response.model_validate(
            obj=self._process_schema_recursively(
                schema=action.response.model_dump(),
            )
        )

        if action.description is not None:
            action.description = action.description[:description_char_limit]

        action.parameters.properties = processor_helper.process_schema_properties(
            action=Action(action.name.upper()),
            properties=action.parameters.properties,
        )

        if action_name_char_limit is not None:
            action.name = action.name[:action_name_char_limit]

        # This is to support anthropic-claude
        if action.name == Action.ANTHROPIC_BASH_COMMAND.slug:
            action.name = "bash"

        if action.name == Action.ANTHROPIC_COMPUTER.slug:
            action.name = "computer"

        if action.name == Action.ANTHROPIC_TEXT_EDITOR.slug:
            action.name = "str_replace_editor"

        return action

    def _get_single_action_schema(self, action: Action) -> ActionModel:
        if action.slug in self._schema_cache:
            return self._schema_cache[action.slug]

        if action.is_runtime:
            (schema,) = (  # pylint: disable=unbalanced-tuple-unpacking
                self.get_runtime_action_schemas(actions=[action])
            )
            return schema

        if action.is_local:
            (schema,) = self.get_local_action_schemas(apps=[], actions=[action])
            return schema

        (schema,) = self.get_remote_actions_schemas(
            apps=[],
            actions=[action],
            check_connected_account=lambda action: action,
        )
        return schema

    def _substitute_file_uploads_recursively(
        self,
        schema: t.Dict,
        request: t.Dict,
        action: Action,
    ) -> t.Dict:
        if "properties" not in schema:
            return request

        params = schema["properties"]
        params_to_process = list(request.keys())
        for _param in params_to_process:
            if _param not in params:
                continue

            if self._file_uploadable(schema=params[_param]):
                # skip if the file is not provided
                if request[_param] is None or request[_param] == "":
                    del request[_param]
                    continue

                request[_param] = FileUploadable.from_path(
                    file=request[_param],
                    client=self._client(),
                    action=action.slug,
                    app=action.app,
                ).model_dump()
                continue

            if isinstance(request[_param], dict) and params[_param]["type"] == "object":
                request[_param] = self._substitute_file_uploads_recursively(
                    schema=params[_param],
                    request=request[_param],
                    action=action,
                )
                continue

        return request

    def substitute_file_uploads(self, action: Action, request: t.Dict) -> t.Dict:
        model = self._get_single_action_schema(action=action)
        return self._substitute_file_uploads_recursively(
            schema=model.parameters.model_dump(),
            request=request,
            action=action,
        )

    def _file_downloadable(self, schema: t.Dict) -> bool:
        if "allOf" in schema:
            return any(
                (
                    _schema.get("file_downloadable", False)
                    if isinstance(_schema, dict)
                    else False
                )
                for _schema in schema["allOf"]
            )
        return schema.get("file_downloadable", False)

    def _find_file_downloadable_from_any_of(
        self, schemas: list[dict]
    ) -> t.Optional[t.Dict]:
        for schema in schemas:
            if "type" not in schema or schema["type"] != "object":
                continue

            if self._file_downloadable(schema=schema):
                return schema

            # Hack to avoid recursive check, maybe use recursion
            if '"file_downloadable":true' in json.dumps(schema):
                return schema

        return None

    def _substitute_file_downloads_recursively(
        self,
        schema: t.Dict,
        request: t.Dict,
        action: Action,
        file_helper: FileIOHelper,
    ) -> t.Dict:
        if "properties" not in schema:
            return request

        params = schema["properties"]
        for _param in request:
            if _param not in params:
                continue

            if self._file_downloadable(schema=params[_param]):
                request[_param] = str(
                    FileDownloadable(**request[_param]).download(
                        file_helper.outdir / action.app / action.slug
                    )
                )
                continue

            if "anyOf" in params[_param]:
                obj = self._find_file_downloadable_from_any_of(params[_param]["anyOf"])
                if obj is None:
                    continue
                params[_param] = obj

            if isinstance(request[_param], dict) and params[_param]["type"] == "object":
                request[_param] = self._substitute_file_downloads_recursively(
                    schema=params[_param],
                    request=request[_param],
                    action=action,
                    file_helper=file_helper,
                )
                continue

        return request

    def substitute_file_downloads(
        self,
        action: Action,
        request: t.Dict,
        file_helper: FileIOHelper,
    ) -> t.Dict:
        model = self._get_single_action_schema(action=action)
        return self._substitute_file_downloads_recursively(
            schema=model.response.model_dump(),
            request=request,
            action=action,
            file_helper=file_helper,
        )


class CustomAuthHelper(WithLogger):

    def __init__(self) -> None:
        super().__init__()
        self._custom_auth: t.Dict[App, CustomAuthObject] = {}

    def add(
        self,
        app: AppType,
        parameters: t.List[CustomAuthParameter],
        base_url: t.Optional[str] = None,
        body: t.Optional[t.Dict] = None,
    ) -> None:
        self._custom_auth[App(app)] = CustomAuthObject(
            body=body or {},
            base_url=base_url,
            parameters=parameters,
        )

    def _get_custom_params_for_local_action(
        self,
        custom_auth: CustomAuthObject,
        app: str,
    ) -> t.Dict:
        metadata = {}
        invalid_auth = []
        for param in custom_auth.parameters:
            if param["in_"] == "metadata":
                metadata[param["name"]] = param["value"]
                continue
            invalid_auth.append(param)

        if len(invalid_auth) > 0:
            raise ComposioSDKError(
                f"Invalid custom auth found for {app}: {invalid_auth}"
            )
        return metadata

    def _get_custom_params_for_runtime_action(
        self,
        custom_auth: CustomAuthObject,
    ) -> t.Dict:
        metadata: t.Dict[str, t.Any] = {
            "base_url": custom_auth.base_url,
            "body": custom_auth.body,
            "path": {},
            "query": {},
            "header": {},
            "subdomain": {},
        }
        for param in custom_auth.parameters:
            if param["in_"] == "metadata":
                metadata[param["name"]] = param["value"]
            else:
                metadata[param["in_"]][param["name"]] = param["value"]
        return metadata

    def get_custom_params_for_local_execution(self, action: Action) -> t.Dict:
        custom_auth = self._custom_auth.get(App(action.app))
        if custom_auth is None:
            return {}

        if action.is_runtime:
            return self._get_custom_params_for_runtime_action(
                custom_auth=custom_auth,
            )

        return self._get_custom_params_for_local_action(
            custom_auth=custom_auth,
            app=action.app,
        )

    def get_custom_params_for_remote_execution(
        self, action: Action
    ) -> t.Optional[CustomAuthObject]:
        return self._custom_auth.get(App(action.app))

    def has_custom_auth(self, app: App) -> bool:
        return app in self._custom_auth


class _GetMixin(WithLogger):

    client: Composio
    entity_id: str
    get_action_schemas: t.Callable

    def find_actions_by_use_case(
        self,
        *apps: AppType,
        use_case: str,
        advanced: bool = False,
    ) -> t.List[Action]:
        """
        Find actions by specified use case.

        :param apps: List of apps to search.
        :param use_case: String describing the use case.
        :param advanced: Use advanced search (will be slower than the normal search)
        :return: A list of actions matching the relevant use case.
        """
        if advanced:
            app_keys = [str(app) for app in apps]
            actions = []
            for task in self.client.actions.search_for_a_task(
                apps=app_keys, use_case=use_case
            ):
                actions += task.actions
        else:
            actions = list(
                map(
                    lambda x: get_enum_key(x.name),
                    self.client.actions.get(
                        apps=[App(app) for app in apps],
                        use_case=use_case,
                        allow_all=True,
                    ),
                )
            )
        return [Action(action) for action in actions]

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
            raise InvalidParams("Please provide at least one tag to perform search")

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

    def get_auth_params(
        self,
        app: t.Optional[AppType] = None,
        connection_id: t.Optional[str] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.Optional[ConnectionParams]:
        """Get authentication parameters for given app."""
        if app is None and connection_id is None:
            raise InvalidParams("Both `app` and `connection_id` cannot be `None`")

        try:
            connection_id = (
                connection_id
                or self.client.get_entity(id=entity_id or self.entity_id)
                .get_connection(app=app)
                .id
            )
            return self.client.connected_accounts.info(connection_id=connection_id)
        except ComposioClientError:
            return None

    def get_auth_schemes(self, app: AppType) -> t.List[AppAuthScheme]:
        """Get the list of auth schemes for an app."""
        return self.client.apps.get(name=str(app)).auth_schemes or []

    def get_app(self, app: AppType) -> AppModel:
        return self.client.apps.get(name=str(App(app)))

    def get_apps(
        self,
        no_auth: t.Optional[bool] = None,
        include_local: bool = True,
    ) -> t.List[AppModel]:
        apps = self.client.apps.get()
        if no_auth is not None:
            apps = [a for a in apps if a.no_auth is no_auth]

        if include_local:
            for app in tool_registry["local"].values():
                apps.append(
                    AppModel(
                        name=app.name,
                        key=app.name,
                        appId=app.name,
                        description=app.description,
                        categories=["local"],
                        meta={},
                        no_auth=True,
                    )
                )
        return apps

    def get_action(self, action: ActionType) -> ActionModel:
        return self.client.actions.get(actions=[action]).pop()

    def get_trigger(self, trigger: TriggerType) -> TriggerModel:
        return self.client.triggers.get(trigger_names=[trigger]).pop()

    def get_trigger_config_scheme(self, trigger: TriggerType) -> TriggerConfigModel:
        return self.get_trigger(trigger=trigger).config

    def get_active_triggers(
        self,
        trigger_ids: t.Optional[t.List[str]] = None,
        connected_account_ids: t.Optional[t.List[str]] = None,
        integration_ids: t.Optional[t.List[str]] = None,
        trigger_names: t.Optional[t.List[TriggerType]] = None,
    ) -> t.List[ActiveTriggerModel]:
        return self.client.active_triggers.get(
            trigger_ids=trigger_ids,
            connected_account_ids=connected_account_ids,
            integration_ids=integration_ids,
            trigger_names=trigger_names,
        )

    def delete_trigger(self, id: str) -> bool:
        delete_status = self.client.triggers.delete(id=id).get("status", None)
        if delete_status is None:
            raise ResourceError("Delete operation failed to return status.")
        return delete_status == "success"

    def get_integration(self, id: str) -> IntegrationModel:
        return self.client.integrations.get(id=id)

    def get_integrations(
        self,
        app: t.Optional[AppType] = None,
        auth_scheme: t.Optional[AuthSchemeType] = None,
        fetch_disabled: bool = False,
    ) -> t.List[IntegrationModel]:
        integrations = self.client.integrations.get(
            show_disabled=fetch_disabled,
            page_size=999,
        )
        if app is not None:
            app = str(app).lower()
            integrations = [i for i in integrations if i.appName.lower() == app]

        if auth_scheme is not None:
            integrations = [i for i in integrations if i.authScheme == auth_scheme]

        return sorted(integrations, key=lambda x: x.createdAt)

    def get_connected_account(self, id: str) -> ConnectedAccountModel:
        return self.client.connected_accounts.get(connection_id=id)

    def get_connected_accounts(self) -> t.List[ConnectedAccountModel]:
        return self.client.connected_accounts.get(
            entity_ids=[self.entity_id] if self.entity_id else None
        )

    def get_entity(self, id: t.Optional[str] = None) -> Entity:
        """Get entity object for given ID."""
        return self.client.get_entity(id=id or self.entity_id)

    def get_auth_scheme_for_app(
        self,
        app: t.Optional[AppType] = None,
        auth_scheme: t.Optional[AuthSchemeType] = None,
    ) -> AppAuthScheme:
        auth_schemes = {
            scheme.auth_mode: scheme
            for scheme in self.client.apps.get(name=str(app)).auth_schemes or []
        }

        if auth_scheme is not None and auth_scheme not in auth_schemes:
            raise InvalidParams(
                message=f"Auth scheme `{auth_scheme}` not found for app `{app}`"
            )

        if auth_scheme is not None:
            return auth_schemes[auth_scheme]

        for scheme in ALL_AUTH_SCHEMES:
            if scheme in auth_schemes:
                scheme = t.cast(AuthSchemeType, scheme)
                return auth_schemes[scheme]

        raise ErrorFetchingResource(
            message=(
                f"Error getting expected params for {app=}, {auth_scheme=}, "
                f"available_schems={list(auth_schemes)}"
            )
        )


class _IntegrationMixin(_GetMixin):
    def _get_expected_params_from_integration_id(self, id: str) -> IntegrationParams:
        integration = self.get_integration(id=id)
        return {
            "integration_id": integration.id,
            "auth_scheme": integration.authScheme,
            "expected_params": integration.expectedInputFields,
        }

    def _get_integration_for_app(
        self,
        app: AppType,
        auth_scheme: t.Optional[str] = None,
    ) -> IntegrationModel:
        for integration in reversed(self.get_integrations(app=app)):
            if integration.appName.lower() == str(app).lower():
                if (
                    auth_scheme is not None
                    and integration.authScheme.lower() != auth_scheme.lower()
                ):
                    continue
                return self.get_integration(id=integration.id)
        raise NoItemsFound(f"No integration found for `{app}`")

    def _get_expected_params_from_app(
        self,
        app: AppType,
        auth_scheme: t.Optional[str] = None,
    ) -> IntegrationParams:
        integration = self._get_integration_for_app(app=app, auth_scheme=auth_scheme)
        return {
            "integration_id": integration.id,
            "auth_scheme": integration.authScheme,
            "expected_params": integration.expectedInputFields,
        }

    def _can_use_auth_scheme_without_user_input(
        self, scheme: AppAuthScheme, app: AppModel
    ) -> bool:
        if (
            scheme.auth_mode in ("OAUTH2", "OAUTH1")
            and len(app.testConnectors or []) > 0
        ):
            return True

        for field in scheme.fields:
            if not field.expected_from_customer and field.required:
                return False

        return True

    def get_expected_params_for_user(
        self,
        app: t.Optional[AppType] = None,
        auth_scheme: t.Optional[AuthSchemeType] = None,
        integration_id: t.Optional[str] = None,
    ) -> IntegrationParams:
        """
        This method returns a list of parameters that are suppossed to be
        provided by the user.
        """
        # If `integration_id` is provided, use it to fetch the params
        if integration_id is not None:
            response = self._get_expected_params_from_integration_id(id=integration_id)
            if auth_scheme is not None and response["auth_scheme"] != auth_scheme:
                raise InvalidParams(
                    message=(
                        "Auth scheme does not match provided integration ID, "
                        f"auth scheme associated with integration ID {response['auth_scheme']} "
                        f"auth scheme provided {auth_scheme}"
                    )
                )
            return response

        if app is None:
            raise InvalidParams("Both `integration_id` and `app` cannot be None")

        try:
            # Check if integration is available for an app, and if available
            # return params from that integration
            return self._get_expected_params_from_app(app=app, auth_scheme=auth_scheme)
        except ValueError:
            pass

        app_data = self.client.apps.get(name=str(app))
        # Go through available schemes and check if any scheme can be used
        # without user inputs to create an integratuib, if yes then create
        # an integration and return params from there.
        for scheme in app_data.auth_schemes or []:
            if auth_scheme is not None and auth_scheme != scheme.auth_mode.upper():
                continue
            if self._can_use_auth_scheme_without_user_input(
                scheme=scheme, app=app_data
            ):
                integration = self.create_integration(
                    app=app,
                    auth_mode=scheme.auth_mode,
                    auth_config={},
                    use_composio_oauth_app=scheme.auth_mode in ("OAUTH2", "OAUTH1"),
                )
                return {
                    "integration_id": integration.id,
                    "auth_scheme": integration.authScheme,
                    "expected_params": integration.expectedInputFields,
                }

        raise IntegrationError(
            message=(
                f"No existing integration found for `{str(app)}`, with auth "
                f"scheme {auth_scheme} Please create an integration and use the"
                " ID to fetch the expected params."
            )
        )

    def fetch_expected_integration_params(
        self,
        app: AppModel,
        auth_scheme: AuthSchemeType,
    ) -> t.List[AuthSchemeField]:
        """Fetch expected integration params for creating an integration."""
        for scheme in app.auth_schemes or []:
            if auth_scheme != scheme.auth_mode.upper():
                continue
            return [f for f in scheme.fields if not f.expected_from_customer]

        raise InvalidParams(
            message=f"{app.name!r} does not support {auth_scheme!r} auth scheme"
        )

    def create_integration(
        self,
        app: AppType,
        auth_mode: t.Optional[AuthSchemeType] = None,
        auth_config: t.Optional[t.Dict[str, t.Any]] = None,
        use_composio_oauth_app: bool = True,
        force_new_integration: bool = False,
    ) -> IntegrationModel:
        app_data = self.client.apps.get(name=str(app))
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        return self.client.integrations.create(
            app_id=app_data.appId,
            name=f"{app}_{timestamp}",
            auth_mode=auth_mode,
            auth_config=auth_config,
            use_composio_auth=use_composio_oauth_app,
            force_new_integration=force_new_integration,
        )

    def _validate_no_auth_scheme(self, auth_scheme):
        if auth_scheme == "NO_AUTH":
            raise InvalidParams(
                "'NO_AUTH' does not require initiating a connection. Please use "
                "the `execute_action` method directly to execute actions for this app."
            )

    def initiate_connection(
        self,
        integration_id: t.Optional[str] = None,
        app: t.Optional[AppType] = None,
        labels: t.Optional[t.List] = None,
        entity_id: t.Optional[str] = None,
        redirect_url: t.Optional[str] = None,
        connected_account_params: t.Optional[t.Dict] = None,
        *,
        auth_scheme: t.Optional[AuthSchemeType] = None,
        auth_config: t.Optional[t.Dict[str, t.Any]] = None,
    ) -> ConnectionRequestModel:
        """
        Initiates a connection with the specified integration.

        If no integration exists for the given app, automatically creates one.

        :param integration_id: (Optional[str]): ID of the existing integration
        :param app: (Optional[AppType]): App to create/use integration for
        :param redirect_url: (Optional[str]) Redirect URL for the App
        :param auth_scheme: (Optional[AuthSchemeType]): Authentication scheme to use
        :return: (ConnectionRequestModel) Details of the connection request.
        """
        if auth_scheme is not None and auth_scheme not in AUTH_SCHEME_WITH_INITIATE:
            self._validate_no_auth_scheme(auth_scheme)
            raise InvalidParams(
                f"'auth_scheme' must be one of {AUTH_SCHEME_WITH_INITIATE}"
            )

        if integration_id is None:
            if app is None:
                raise InvalidParams(
                    message="Both `integration_id` and `app` cannot be None"
                )

            if auth_scheme is None:
                auth_scheme = self.get_auth_scheme_for_app(app).auth_mode

            if auth_scheme is not None and auth_scheme not in AUTH_SCHEME_WITH_INITIATE:
                self._validate_no_auth_scheme(auth_scheme)
                raise InvalidParams(
                    f"'auth_scheme' must be one of {AUTH_SCHEME_WITH_INITIATE}"
                )

            try:
                integration_id = self._get_integration_for_app(
                    app=t.cast(
                        AppType,
                        app,
                    ),
                    auth_scheme=auth_scheme,
                ).id
            except NoItemsFound:
                auth_config, use_composio_auth = self._validate_auth_config(
                    app, auth_scheme, auth_config
                )
                integration = self.create_integration(
                    app=app,
                    auth_mode=auth_scheme,
                    auth_config=auth_config,
                    use_composio_oauth_app=use_composio_auth,
                )
                integration_id = integration.id

        connected_account_params = connected_account_params or {}
        expected_params = self.get_expected_params_for_user(
            auth_scheme=auth_scheme, integration_id=integration_id
        )["expected_params"]
        required_params = [param for param in expected_params if param.required]
        unavailable_params = [
            param.name
            for param in required_params
            if param.name not in connected_account_params
        ]
        if unavailable_params:
            raise InvalidParams(
                f"Expected 'connected_account_params' to provide these params: {unavailable_params}"
            )

        # Populate defaults in the connected_account_params
        for param in expected_params:
            if param.default is not None and param.name not in connected_account_params:
                connected_account_params[param.name] = param.default

        return self.client.connected_accounts.initiate(
            integration_id=integration_id,
            entity_id=entity_id or self.entity_id,
            params=connected_account_params,
            labels=labels,
            redirect_url=redirect_url,
        )

    def _validate_auth_config(
        self,
        app: AppType,
        auth_scheme: AuthSchemeType,
        auth_config: t.Optional[t.Dict[str, t.Any]],
    ) -> t.Tuple[t.Optional[t.Dict[str, t.Any]], bool]:
        app_data = self.client.apps.get(name=str(app))
        if auth_config is None and app_data.testConnectors:
            # If we have connectors, can fallback to composio's own auth
            return None, True

        if auth_config is None:
            auth_config = {}

        auth_fields = self.fetch_expected_integration_params(
            app=app_data, auth_scheme=auth_scheme
        )
        required_fields = [field for field in auth_fields if field.required]
        unavailable_fields = [
            field.name for field in required_fields if field.name not in auth_config
        ]
        if unavailable_fields:
            raise InvalidParams(
                f"Expected 'auth_config' to provide these fields: {unavailable_fields}"
            ) from None

        # Populate defaults in the auth_config
        for field in auth_fields:
            if field.default is not None and field.name not in auth_config:
                auth_config[field.name] = field.default

        return auth_config, False


class ComposioToolSet(_IntegrationMixin):
    """Composio toolset."""

    _connected_accounts: t.Optional[t.List[ConnectedAccountModel]] = None
    _remote_client: t.Optional[Composio] = None
    _workspace: t.Optional[Workspace] = None

    _runtime: str = "composio"
    _description_char_limit: int = 1024
    _action_name_char_limit: t.Optional[int] = None
    _log_ingester_client: t.Optional[LogIngester] = None

    def __init_subclass__(
        cls,
        *args: t.Any,
        runtime: t.Optional[str] = None,
        description_char_limit: t.Optional[int] = None,
        action_name_char_limit: t.Optional[int] = None,
        **kwargs: t.Any,
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
        cls._action_name_char_limit = action_name_char_limit
        if len(args) > 0 or len(kwargs) > 0:
            error = (
                f"Composio toolset subclass initializer got extra {args=} and {kwargs=}"
                + help_msg()
            )
            if _is_ci():
                raise RuntimeError(error)
            warnings.warn(error)

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        entity_id: str = DEFAULT_ENTITY_ID,
        workspace_id: t.Optional[str] = None,
        workspace_config: t.Optional[WorkspaceConfigType] = None,
        metadata: t.Optional[MetadataType] = None,
        processors: t.Optional[ProcessorsType] = None,
        logging_level: LogLevel = LogLevel.INFO,
        output_dir: t.Optional[Path] = None,
        output_in_file: bool = False,
        verbosity_level: t.Optional[int] = None,
        allow_tracing: bool = False,
        connected_account_ids: t.Optional[t.Dict[AppType, str]] = None,
        *,
        max_retries: int = 3,
        lockfile: t.Optional[Path] = None,
        lock: bool = True,
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
            toolset = ComposioToolSet(
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

            toolset = ComposioToolSet(
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
        :param connection_ids: Use this to define connection IDs to use when executing
            an action for a specific app.
        """
        super().__init__(logging_level=logging_level, verbosity_level=verbosity_level)
        if len(kwargs) > 0:
            self.logger.warning(
                f"Unused kwargs while initializing toolset: {kwargs}" + help_msg()
            )

        self.session_id = workspace_id or uuid.uuid4().hex
        self.entity_id = entity_id
        self.output_in_file = output_in_file

        self._base_url = base_url or get_api_url_base()
        try:
            self._api_key = (
                api_key
                or os.environ.get(ENV_COMPOSIO_API_KEY)
                or UserData.load(LOCAL_CACHE_DIRECTORY / USER_DATA_FILE_NAME).api_key
            )
        except FileNotFoundError:
            self._api_key = None
            self.logger.debug("`api_key` is not set when initializing toolset.")

        self._version_lock = VersionLock(path=lockfile) if lock else None
        self._schema_helper = SchemaHelper(client=self._init_client)
        self._file_io_helper = FileIOHelper(outdir=output_dir)
        self._custom_auth_helper = CustomAuthHelper()
        self._processor_helpers = ProcessorHelper(metadata=metadata or {})
        if processors is not None:
            warnings.warn(
                "Setting 'processors' on the ToolSet is deprecated, they should"
                "be provided to the 'get_tools()' method instead.\n",
                DeprecationWarning,
                stacklevel=2,
            )
            self._processor_helpers.merge_processors(processors=processors)

        self._workspace_id = workspace_id
        self._workspace_config = workspace_config
        self._local_client = LocalClient()

        self.logger.debug("Loading local tools")
        load_local_tools()

        self._connected_account_ids = self._validate_connection_ids(
            connected_account_ids=connected_account_ids or {}
        )
        self.max_retries = max_retries
        self.add_auth = self._custom_auth_helper.add
        self.allow_tracing = allow_tracing
        # To be populated by get_tools(), from within subclasses like composio_openai's Toolset.
        self._requested_actions: t.List[str] = []

    @property
    def _log_service(self) -> LogIngester:
        if self._log_ingester_client is None:
            self._log_ingester_client = LogIngester()
        return self._log_ingester_client

    @property
    def api_key(self) -> str:
        if self._api_key is None:
            raise ApiKeyNotProvidedError
        return self._api_key

    def _init_client(self) -> Composio:
        if self._remote_client is None:
            self._remote_client = Composio(
                api_key=self._api_key,
                base_url=self._base_url,
                runtime=self._runtime,
            )
            check_cache_refresh(self._remote_client)

        self._remote_client.local = self._local_client
        return self._remote_client

    @property
    def client(self) -> Composio:  # type: ignore[override]
        return self._init_client()

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
            try:
                workspace_config.composio_api_key = self.api_key
            except ApiKeyNotProvidedError:
                warnings.warn(
                    "Running without a Composio API key", UserWarning, stacklevel=2
                )

        if workspace_config.composio_base_url is None:
            workspace_config.composio_base_url = self._base_url

        if (
            workspace_config.github_access_token is None
            and workspace_config.composio_api_key is not None
        ):
            workspace_config.github_access_token = (
                self._try_get_github_access_token_for_current_entity()
            )

        self._workspace = WorkspaceFactory.new(config=workspace_config)
        return self._workspace

    def _validate_connection_ids(
        self,
        connected_account_ids: t.Dict[AppType, str],
    ) -> t.Dict[App, str]:
        """Validate connection IDs."""
        valid = {}
        invalid = []
        entity = self.client.get_entity(id=self.entity_id)
        for app, connected_account_id in connected_account_ids.items():
            self.logger.debug(f"Validating {app} {connected_account_id=}")
            try:
                entity.get_connection(
                    app=app,
                    connected_account_id=connected_account_id,
                )
                valid[App(app)] = connected_account_id
            except HTTPError:
                invalid.append((str(app), connected_account_id))

        if len(invalid) == 0:
            return valid
        raise InvalidConnectedAccount(f"Invalid connected accounts found: {invalid}")

    def check_connected_account(
        self, action: ActionType, entity_id: t.Optional[str] = None
    ) -> None:
        """Check if connected account is required and if required it exists or not."""
        action = Action(action)
        if action.no_auth or action.is_runtime:
            return

        if self._custom_auth_helper.has_custom_auth(App(action.app)):
            return

        if self._connected_accounts is None:
            self._connected_accounts = t.cast(
                t.List[ConnectedAccountModel],
                self.client.connected_accounts.get(),
            )

        if action.app not in [
            connection.appUniqueId.upper()  # Normalize app names/ids coming from API
            for connection in self._connected_accounts
            if entity_id is None or connection.clientUniqueUserId == entity_id
        ]:
            raise ConnectedAccountNotFoundError(
                f"No connected account found for app `{action.app}`; "
                f"Run `composio add {action.app.lower()}` to fix this"
            )

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

    def set_workspace_id(self, workspace_id: str) -> None:
        self._workspace_id = workspace_id
        if self._workspace is not None:
            self._workspace = WorkspaceFactory.get(id=workspace_id)

    def _serialize_execute_params(self, param: ParamType) -> ParamType:
        """Returns a serialized version of the parameters object."""
        if param is None:
            return param  # type: ignore

        if isinstance(param, (int, float, str, bool)):
            return param  # type: ignore

        if isinstance(param, BaseModel):
            return param.model_dump(exclude_none=True)  # type: ignore

        if isinstance(param, list):
            return [self._serialize_execute_params(p) for p in param]  # type: ignore

        if isinstance(param, dict):
            return {
                key: self._serialize_execute_params(val)  # type: ignore
                for key, val in param.items()
            }

        raise ValueError(
            "Invalid value found for execute parameters"
            f"\ntype={type(param)} \nvalue={param}"
        )

    def _execute_local(
        self,
        action: Action,
        params: t.Dict,
        metadata: t.Optional[t.Dict] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.Dict:
        """Execute a local action."""
        metadata = metadata or {}
        metadata["_toolset"] = self
        metadata.update(
            self._custom_auth_helper.get_custom_params_for_local_execution(
                action=action
            )
        )
        response = self.workspace.execute_action(
            action=action,
            request_data=params,
            metadata={
                **(metadata or {}),
                "entity_id": entity_id or self.entity_id,
            },
        )

        if isinstance(response, BaseModel):
            response = response.model_dump()

        self._log_service.log(
            connection_id=None,
            provider_name=action.app,
            action_name=action.name,
            request=params,
            response=response,
            is_error=not response.get("successful", False),
            session_id=self.workspace.id,
        )

        return response

    def _execute_remote(
        self,
        action: Action,
        params: t.Dict,
        entity_id: str = DEFAULT_ENTITY_ID,
        connected_account_id: t.Optional[str] = None,
        session_id: t.Optional[str] = None,
        text: t.Optional[str] = None,
        allow_tracing: bool = False,
    ) -> t.Dict:
        """Execute a remote action."""
        auth = self._custom_auth_helper.get_custom_params_for_remote_execution(
            action=action
        )
        if auth is None:
            self.check_connected_account(action=action, entity_id=entity_id)

        output = self.client.get_entity(  # pylint: disable=protected-access
            id=entity_id
        )._execute(
            action=action,
            params=params,
            auth=auth,
            text=text,
            session_id=session_id,
            connected_account_id=connected_account_id,
            allow_tracing=allow_tracing,
        )
        output = self._schema_helper.substitute_file_downloads(
            action=action,
            request=output,
            file_helper=self._file_io_helper,
        )

        if not self.output_in_file:
            return output

        return self._file_io_helper.write_output(
            action=action,
            output=output,
            entity_id=entity_id,
        )

    @_record_action_if_available
    def execute_action(
        self,
        action: ActionType,
        params: dict,
        metadata: t.Optional[t.Dict] = None,
        entity_id: t.Optional[str] = None,
        connected_account_id: t.Optional[str] = None,
        text: t.Optional[str] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        _check_requested_actions: bool = False,
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
        if self._version_lock is not None:
            (action,) = self._version_lock.apply(actions=[action])

        if _check_requested_actions and action.slug not in self._requested_actions:
            raise InvalidParams(
                f"Action {action.slug} is being called, but was never requested by the toolset. "
                "Make sure that the actions you are trying to execute are requested in your "
                "`get_tools()` call."
            )

        params = self._serialize_execute_params(param=params)
        if processors is not None:
            self._processor_helpers.merge_processors(processors)

        params = self._schema_helper.substitute_file_uploads(
            action=action,
            request=params,
        )
        if not action.is_runtime:
            params = self._processor_helpers.process_request(
                action=action, request=params
            )
            metadata = self._processor_helpers.add_metadata(
                action=action, metadata=metadata
            )
            connected_account_id = (
                connected_account_id
                or self._connected_account_ids.get(App(Action(action).app))
            )

        self.logger.debug(
            f"Executing `{action.slug}@{action.version}` with {params=} "
            f"and {metadata=} {connected_account_id=}"
        )

        failed_responses = []
        for _ in range(self.max_retries):
            response = (
                self._execute_local(
                    action=action,
                    params=params,
                    metadata=metadata,
                    entity_id=entity_id,
                )
                if action.is_local
                else self._execute_remote(
                    action=action,
                    params=params,
                    entity_id=entity_id or self.entity_id,
                    connected_account_id=connected_account_id,
                    text=text,
                    session_id=self.session_id,
                    allow_tracing=self.allow_tracing,
                )
            )
            processed_response = (
                response
                if action.is_runtime
                else self._processor_helpers.process_respone(
                    action=action,
                    response=response,
                )
            )
            if isinstance(processed_response, _Retry):
                self.logger.debug(
                    f"Got {processed_response=} from {action=} with {params=}, retrying..."
                )
                failed_responses.append(response)
                continue

            response = processed_response
            self.logger.debug(f"Got {response=} from {action=} with {params=}")
            return response

        return SuccessExecuteActionResponseModel(
            successfull=False,
            data={"failed_responses": failed_responses},
            error=f"Execution failed after {self.max_retries} retries.",
        ).model_dump()

    @t.overload
    def execute_request(
        self,
        endpoint: str,
        method: str,
        *,
        body: t.Optional[t.Dict] = None,
        parameters: t.Optional[t.List[CustomAuthParameter]] = None,
        connection_id: t.Optional[str] = None,
    ) -> t.Dict:
        pass

    @t.overload
    def execute_request(
        self,
        endpoint: str,
        method: str,
        *,
        body: t.Optional[t.Dict] = None,
        parameters: t.Optional[t.List[CustomAuthParameter]] = None,
        app: t.Optional[AppType] = None,
    ) -> t.Dict:
        pass

    def execute_request(
        self,
        endpoint: str,
        method: str,
        *,
        body: t.Optional[t.Dict] = None,
        parameters: t.Optional[t.List[CustomAuthParameter]] = None,
        connection_id: t.Optional[str] = None,
        app: t.Optional[AppType] = None,
    ) -> t.Dict:
        """
        Execute a proxy request to a connected account.

        :param endpoint: API endpoint to call
        :param method: HTTP method to use (GET, POST, etc.)
        :param body: Request body data
        :param parameters: Additional auth parameters
        :param connection_id: ID of the connected account
        :param app: App type to use for connection lookup

        :returns: Response from the proxy request
        :raises: InvalidParams: If neither connection_id nor app is provided
        """
        if app is not None and connection_id is None:
            connection_id = (
                self.get_entity(id=self.entity_id).get_connection(app=app).id
            )

        if connection_id is None:
            raise InvalidParams(
                "Please provide connection id or app name to execute a request"
            )

        self.logger.debug(
            f"Executing request to {endpoint} with method={method}, connection_id={connection_id}"
        )
        response = self.client.actions.request(
            connection_id=connection_id,
            body=body,
            method=method,
            endpoint=endpoint,
            parameters=parameters,
        )
        self.logger.debug(f"Got {response=}")
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
        *,
        check_connected_accounts: bool = True,
        _populate_requested: bool = False,
    ) -> t.List[ActionModel]:
        apps = t.cast(t.List[App], _map_enums(App, apps or []))
        actions = t.cast(t.List[Action], _map_enums(Action, actions or []))
        if self._version_lock is not None:
            actions = self._version_lock.apply(actions=actions)

        items: t.List[ActionModel] = [
            *self._schema_helper.get_runtime_action_schemas(actions=actions),
            *self._schema_helper.get_local_action_schemas(
                apps=apps, actions=actions, tags=tags
            ),
            *self._schema_helper.get_remote_actions_schemas(
                apps=apps,
                actions=actions,
                tags=tags,
                check_connected_account=(
                    self.check_connected_account if check_connected_accounts else None
                ),
            ),
        ]

        items = list(
            map(
                lambda x: self._schema_helper.process_schema(
                    action=x,
                    processor_helper=self._processor_helpers,
                    description_char_limit=self._description_char_limit,
                    action_name_char_limit=self._action_name_char_limit,
                ),
                items,
            )
        )

        if _populate_requested:
            self._requested_actions += [item.name for item in items]

        if self._version_lock is not None:
            self._version_lock.lock()

        return items

    def create_trigger_listener(self, timeout: float = 15.0) -> TriggerSubscription:
        """Create trigger subscription."""
        return self.client.triggers.subscribe(timeout=timeout)
