import os
import threading
import typing as t
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import requests

from composio.client.enums import Action, ActionType, AppType, TagType
from composio.constants import ENV_COMPOSIO_API_KEY, ENV_COMPOSIO_BASE_URL
from composio.exceptions import ComposioSDKError
from composio.tools.env.id import generate_id
from composio.utils.logging import WithLogger


ENV_GITHUB_ACCESS_TOKEN = "GITHUB_ACCESS_TOKEN"
ENV_ACCESS_TOKEN = "ACCESS_TOKEN"

WORKSPACE_PROMPT = """You have access to a workspace with open {ports} network
ports being available publicly and hostname to reach this machine is {host}, 
you can use this for development and deployment purposes.
"""


def _read_env_var(name: str, default: t.Any) -> str:
    """Read environment variable."""
    if default is not None:
        return default

    value = os.environ.get(name, default)
    if value is None:
        raise ComposioSDKError(f"Please provide value for `{name}`")
    return value


class Sessionable(WithLogger, ABC):
    """Sessionable abstraction"""

    _id: str

    def __str__(self) -> str:
        """String representation."""
        return f"Sessionable(type={self.__class__.__name__}, id={self.id})"

    __repr__ = __str__

    @property
    def id(self) -> str:
        """Get shell ID."""
        return self._id

    @abstractmethod
    def setup(self) -> None:
        """Setup session."""

    @abstractmethod
    def teardown(self) -> None:
        """Teardown session."""


SessionableType = t.TypeVar("SessionableType", bound=Sessionable)


class SessionFactory(WithLogger, t.Generic[SessionableType]):
    """Factory abstraction."""

    _session: t.Dict[str, SessionableType] = {}
    _recent: t.Optional[SessionableType] = None
    _lock: threading.Lock = threading.Lock()

    def __init__(self, factory: t.Callable[[], SessionableType]) -> None:
        """Creatte shell factory"""
        super().__init__()
        self._factory = factory

    @property
    def recent(self) -> SessionableType:
        """Get most recent workspace."""
        with self._lock:
            session = self._recent
        if session is None:
            session = self.new()
            with self._lock:
                self._recent = session
        return session

    @recent.setter
    def recent(self, shell: SessionableType) -> None:
        """Get most recent workspace."""
        with self._lock:
            self._recent = shell

    def new(self) -> SessionableType:
        """Create a new shell."""
        session = self._factory()
        session.setup()
        self._session[session.id] = session
        self.recent = session
        return session

    def get(self, id: t.Optional[str] = None) -> SessionableType:
        """Get shell instance."""
        if id is None or id == "":
            return self.recent

        if id not in self._session:
            raise ComposioSDKError(
                message=f"No session of type {self._factory.__name__} found with ID: {id}",
            )
        shell = self._session[id]
        self.recent = shell
        return shell

    def teardown(self) -> None:
        """Stop all running shells."""
        while len(self._session) > 0:
            id = list(self._session.keys()).pop()
            session = self._session.pop(id)
            session.teardown()
        self._recent = None


@dataclass
class WorkspaceConfigType:
    """Workspace configuration."""

    composio_api_key: t.Optional[str] = None
    """Composio API Key."""

    composio_base_url: t.Optional[str] = None
    """Base URL for composio backend."""

    github_access_token: t.Optional[str] = None
    """Github access token agent workspace, if not provided the access token from the active composio account will be used."""

    environment: t.Optional[t.Dict[str, str]] = None
    """Environment config for workspace."""

    persistent: bool = False
    """Set `True` to make this workspace persistent."""


class Workspace(WithLogger, ABC):
    """Workspace abstraction for executing tools."""

    url: str
    """URL for the tooling server (Only applicable for remote workspace)."""

    host: str
    """Host string for the workspace."""

    ports: t.List[int]
    """List of available ports on the workspace, if empty all of the ports are available."""

    def __init__(self, config: WorkspaceConfigType):
        """Initialize workspace."""
        super().__init__()
        self.id = generate_id()
        self.access_token = uuid4().hex.replace("-", "")
        self.persistent = config.persistent
        self.environment = {
            **(config.environment or {}),
            ENV_ACCESS_TOKEN: self.access_token,
        }

    def __str__(self) -> str:
        """String representation."""
        return f"Workspace(type={self.__class__.__name__}, id={self.id})"

    __repr__ = __str__

    def as_prompt(self) -> str:
        """Format current workspace details for the agentic use."""
        return WORKSPACE_PROMPT.format(ports=self.ports, host=self.host)

    @abstractmethod
    def check_for_missing_dependencies(
        self,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> None:
        """Install dependecies in the given workspace."""

    @abstractmethod
    def setup(self) -> None:
        """Setup workspace."""

    @abstractmethod
    def execute_action(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute an action in this workspace."""

    @abstractmethod
    def teardown(self) -> None:
        """Teardown current workspace."""


class RemoteWorkspace(Workspace):
    """Remote workspace client."""

    def __init__(self, config: WorkspaceConfigType):
        super().__init__(config)
        self.composio_api_key = _read_env_var(
            name=ENV_COMPOSIO_API_KEY,
            default=config.composio_api_key,
        )
        self.composio_base_url = _read_env_var(
            name=ENV_COMPOSIO_BASE_URL,
            default=config.composio_base_url,
        )
        self.github_access_token = (
            config.github_access_token
            if config.github_access_token is not None
            else os.environ.get(ENV_GITHUB_ACCESS_TOKEN, "NO_VALUE")
        )
        self.environment.update(
            {
                ENV_COMPOSIO_API_KEY: self.composio_api_key,
                ENV_COMPOSIO_BASE_URL: self.composio_base_url,
                ENV_GITHUB_ACCESS_TOKEN: self.github_access_token,
                f"_COMPOSIO_{ENV_GITHUB_ACCESS_TOKEN}": self.github_access_token,
                ENV_ACCESS_TOKEN: self.access_token,
            }
        )

    def _request(
        self,
        endpoint: str,
        method: str,
        json: t.Optional[t.Dict] = None,
        timeout: t.Optional[float] = 300.0,
        log: bool = True,
    ) -> requests.Response:
        """Make request to the tooling server."""
        response = requests.request(
            url=f"{self.url}{endpoint}",
            method=method,
            json=json,
            headers={
                "x-api-key": self.access_token,
            },
            timeout=timeout,
        )
        if log:
            self.logger.debug(
                f"Making HTTP request on {self.id}\n"
                f"Request: {method.upper()} {endpoint} @ {self.url}\n"
                f"Response: {response.status_code} -> {response.text}"
            )
        if response.status_code in (500, 503):
            raise ComposioSDKError(
                message=(
                    f"Error requesting data from {self}, "
                    f"Request: {method.upper()} {endpoint} @ {self.url}\n"
                    f"Response: {response.status_code} -> {response.text}"
                ),
            )
        return response

    def _upload(self, action: Action) -> None:
        """Upload action instance to tooling server."""
        from composio.tools.base.abs import (  # pylint: disable=import-outside-toplevel
            tool_registry,
        )

        obj = tool_registry["runtime"][action.app].get(action)
        request = self._request(
            method="post",
            endpoint="/tools",
            json={
                "content": Path(obj.file).read_text(encoding="utf-8"),
                "filename": Path(obj.file).name,
                "dependencies": obj.requires or [],
            },
        )
        if request.status_code != 200:
            raise ComposioSDKError(
                message=f"Error uploading {action.slug}: {request.status_code=} {request.text}"
            )

        response = request.json()
        if response["error"] is not None:
            raise ComposioSDKError(
                f"Error while uploading {action.slug}: " + response["error"]
            )

        self.logger.debug(
            f"Successfully uploaded: {action.slug} - {response}",
        )

    def check_for_missing_dependencies(
        self,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> None:
        request = self._request(
            endpoint="/validate",
            method="post",
            json={
                "apps": list(map(str, apps or [])),
                "actions": list(
                    map(str, filter(lambda x: not hasattr(x, "enum"), actions or []))
                ),
                "tags": list(map(str, tags or [])),
            },
            timeout=600,
        )
        if request.status_code != 200:
            raise ComposioSDKError(f"Error installing dependencies: {request.text}")

        response = request.json()
        if response["error"] is not None:
            raise ComposioSDKError(
                f"Error installing dependencies: {response['error']}"
            )

    def execute_action(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action in docker workspace."""
        if action.is_runtime:
            self._upload(action=action)

        _ = metadata.pop("_toolset", None)
        request = self._request(
            method="post",
            endpoint=f"/actions/execute/{action.slug}",
            json={
                "params": request_data,
                "metadata": metadata,
            },
        )
        if request.status_code != 200:
            raise ComposioSDKError(
                message=f"Error executing {action.slug}: {request.status_code=} {request.text}"
            )

        response = request.json()
        if response["error"] is None:
            return response["data"]
        raise RuntimeError(f"Error while executing {action.slug}: " + response["error"])
