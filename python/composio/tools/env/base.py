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
from composio.tools.env.filemanager import FileManager
from composio.tools.env.id import generate_id
from composio.tools.local.handler import get_runtime_action
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


class FileManagerFactory(WithLogger):
    """File manager factory."""

    _recent: t.Optional[FileManager] = None
    _file_managers: t.Dict[str, FileManager] = {}
    _lock: threading.Lock = threading.Lock()

    def __init__(self, factory: t.Callable[[], FileManager]) -> None:
        """Create file manager factory"""
        super().__init__()
        self._factory = factory

    @property
    def recent(self) -> FileManager:
        """Get most recent file manager."""
        with self._lock:
            file_manager = self._recent
        if file_manager is None:
            file_manager = self.new()
            with self._lock:
                self._recent = file_manager
        return file_manager

    @recent.setter
    def recent(self, file_manager: FileManager) -> None:
        """Set most recent file manager."""
        with self._lock:
            self._recent = file_manager

    def new(self) -> FileManager:
        """Create a new file manager."""
        file_manager = self._factory()
        self._file_managers[file_manager.id] = file_manager
        self.recent = file_manager
        return file_manager

    def get(self, id: t.Optional[str] = None) -> FileManager:
        """Get file manager instance."""
        if id is None or id == "":
            return self.recent
        if id not in self._file_managers:
            raise ComposioSDKError(
                message=f"No file manager found with ID: {id}",
            )
        file_manager = self._file_managers[id]
        self.recent = file_manager
        return file_manager

    def teardown(self) -> None:
        """Clean up all file managers."""
        self._file_managers.clear()
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

    _shell_factory: t.Optional[ShellFactory] = None

    _file_manager_factory: t.Optional[FileManagerFactory] = None

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
        self.persistent = config.persistent

    def __str__(self) -> str:
        """String representation."""
        return f"Workspace(type={self.__class__.__name__}, id={self.id})"

    __repr__ = __str__

    def as_prompt(self) -> str:
        """Format current workspace details for the agentic use."""
        return WORKSPACE_PROMPT.format(ports=self.ports, host=self.host)

    @abstractmethod
    def setup(self) -> None:
        """Setup workspace."""

    @property
    def file_managers(self) -> FileManagerFactory:
        """Returns file manager for current workspace."""
        if self._file_manager_factory is None:
            self._file_manager_factory = FileManagerFactory(
                factory=self._create_file_manager,
            )
        return self._file_manager_factory

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
    def _create_file_manager(self) -> FileManager:
        """Create file manager for the workspace."""

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

    def _create_file_manager(self) -> FileManager:
        raise NotImplementedError(
            "Creating file manager for remote workspaces is not allowed."
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
                "dependencies": obj.requires or [],
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
