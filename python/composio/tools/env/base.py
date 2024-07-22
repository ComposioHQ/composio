import os
import threading
import typing as t
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import requests

from composio.client.enums import Action
from composio.constants import ENV_COMPOSIO_API_KEY, ENV_COMPOSIO_BASE_URL
from composio.exceptions import ComposioSDKError
from composio.tools.env.id import generate_id
from composio.tools.local.handler import get_runtime_action
from composio.utils.logging import WithLogger


ENV_GITHUB_ACCESS_TOKEN = "GITHUB_ACCESS_TOKEN"
ENV_ACCESS_TOKEN = "ACCESS_TOKEN"


def _read_env_var(name: str, default: t.Any) -> str:
    """Read environment variable."""
    if default is not None:
        return default

    value = os.environ.get(name, default)
    if value is None:
        raise ValueError(f"Please provide value for `{name}`")
    return value


class Shell(ABC, WithLogger):
    """Abstract shell session."""

    _id: str

    def sanitize_command(self, cmd: str) -> bytes:
        """Prepare command string."""
        return (cmd.rstrip() + "\n").encode()

    def __str__(self) -> str:
        """String representation."""
        return f"Shell(type={self.__class__.__name__}, id={self.id})"

    __repr__ = __str__

    @property
    def id(self) -> str:
        """Get shell ID."""
        return self._id

    @abstractmethod
    def setup(self) -> None:
        """Setup shell."""

    @abstractmethod
    def exec(self, cmd: str) -> t.Dict:
        """Execute command on container."""

    @abstractmethod
    def stop(self) -> None:
        """Stop and remove the running shell."""


class ShellFactory(WithLogger):
    """Shell factory."""

    _recent: t.Optional[Shell] = None
    _shells: t.Dict[str, Shell] = {}
    _lock: threading.Lock = threading.Lock()

    def __init__(self, factory: t.Callable[[], Shell]) -> None:
        """Creatte shell factory"""
        super().__init__()
        self._factory = factory

    @property
    def recent(self) -> Shell:
        """Get most recent workspace."""
        with self._lock:
            shell = self._recent
        if shell is None:
            shell = self.new()
            with self._lock:
                self._recent = shell
        return shell

    @recent.setter
    def recent(self, shell: Shell) -> None:
        """Get most recent workspace."""
        with self._lock:
            self._recent = shell

    def new(self) -> Shell:
        """Create a new shell."""
        shell = self._factory()
        shell.setup()
        self._shells[shell.id] = shell
        self.recent = shell
        return shell

    def get(self, id: t.Optional[str] = None) -> Shell:
        """Get shell instance."""
        if id is None or id == "":
            return self.recent
        if id not in self._shells:
            raise ComposioSDKError(
                message=f"No shell found with ID: {id}",
            )
        shell = self._shells[id]
        self.recent = shell
        return shell

    def exec(self, cmd: str, id: t.Optional[str] = None) -> t.Dict:
        """Execute a command on shell."""
        return self.get(id=id).exec(cmd=cmd)

    def stop(self, id: str) -> None:
        """Stop shell with given ID."""
        if id not in self._shells:
            return
        shell = self._shells.pop(id)
        shell.stop()

    def teardown(self) -> None:
        """Stop all running shells."""
        while len(self._shells) > 0:
            id, *_ = list(self._shells.keys())
            self._shells.pop(id).stop()
            self.logger.debug(f"Stopped shell with ID: {id}")
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


class Workspace(WithLogger, ABC):
    """Workspace abstraction for executing tools."""

    _shell_factory: t.Optional[ShellFactory] = None

    def __init__(self, config: WorkspaceConfigType):
        """Initialize workspace."""
        super().__init__()
        self.id = generate_id()
        self.access_token = uuid4().hex.replace("-", "")
        self.composio_api_key = _read_env_var(
            name=ENV_COMPOSIO_API_KEY,
            default=config.composio_api_key,
        )
        self.composio_base_url = _read_env_var(
            name=ENV_COMPOSIO_BASE_URL,
            default=config.composio_base_url,
        )
        self.github_access_token = config.github_access_token or os.environ.get(
            ENV_GITHUB_ACCESS_TOKEN, "NO_VALUE"
        )
        self.environment = {
            **(config.environment or {}),
            ENV_COMPOSIO_API_KEY: self.composio_api_key,
            ENV_COMPOSIO_BASE_URL: self.composio_base_url,
            ENV_GITHUB_ACCESS_TOKEN: self.github_access_token,
            f"_COMPOSIO_{ENV_GITHUB_ACCESS_TOKEN}": self.github_access_token,
            ENV_ACCESS_TOKEN: self.access_token,
        }

    def __str__(self) -> str:
        """String representation."""
        return f"Workspace(type={self.__class__.__name__}, id={self.id})"

    __repr__ = __str__

    @abstractmethod
    def setup(self) -> None:
        """Setup workspace."""

    @property
    def shells(self) -> ShellFactory:
        """Returns shell factory for current workspace."""
        if self._shell_factory is None:
            self._shell_factory = ShellFactory(
                factory=self._create_shell,
            )
        return self._shell_factory

    @abstractmethod
    def _create_shell(self) -> Shell:
        """Create shell."""

    @abstractmethod
    def execute_action(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute an action in this workspace."""

    def teardown(self) -> None:
        """Teardown current workspace."""
        self.shells.teardown()


class RemoteWorkspace(Workspace):
    """Remote workspace client."""

    url: str

    def _request(
        self,
        endpoint: str,
        method: str,
        json: t.Optional[t.Dict] = None,
        timeout: t.Optional[float] = 300.0,
    ) -> requests.Response:
        """Make request to the tooling server."""
        return requests.request(
            url=f"{self.url}{endpoint}",
            method=method,
            json=json,
            headers={
                "x-api-key": self.access_token,
            },
            timeout=timeout,
        )

    def _create_shell(self) -> Shell:
        raise NotImplementedError(
            "Creating shells for remote workspaces is not allowed."
        )

    def _upload(self, action: Action) -> None:
        """Upload action instance to tooling server."""
        obj = get_runtime_action(name=action.name)
        request = self._request(
            method="post",
            endpoint="/tools",
            json={
                "content": Path(str(obj.module)).read_text(encoding="utf-8"),
                "filename": Path(str(obj.module)).name,
                "dependencies": obj.requires or {},
            },
        )
        response = request.json()
        if response["error"] is not None:
            self.logger.error(
                f"Error while uploading {action.slug}: " + response["error"]
            )
        else:
            self.logger.debug(
                f"Succesfully uploaded: {action.slug}",
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

        request = self._request(
            method="post",
            endpoint=f"/actions/execute/{action.slug}",
            json={
                "params": request_data,
                "metadata": metadata,
            },
        )
        response = request.json()
        if response["error"] is None:
            return response["data"]
        raise RuntimeError(f"Error while executing {action.slug}: " + response["error"])
