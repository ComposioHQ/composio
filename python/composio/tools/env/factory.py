import atexit
import threading
import typing as t

from composio.exceptions import ComposioSDKError
from composio.tools.env.base import Workspace, WorkspaceConfigType
from composio.tools.env.docker.workspace import Config as DockerWorkspaceConfig
from composio.tools.env.docker.workspace import DockerWorkspace
from composio.tools.env.e2b.workspace import Config as E2BWorkspaceConfig
from composio.tools.env.e2b.workspace import E2BWorkspace
from composio.tools.env.flyio.workspace import Config as FlyIOWorkspaceConfig
from composio.tools.env.flyio.workspace import FlyIOWorkspace
from composio.tools.env.host.workspace import Config as HostWorkspaceConfig
from composio.tools.env.host.workspace import HostWorkspace
from composio.utils.logging import get as get_logger


WorkspaceTypeVar = t.TypeVar("WorkspaceTypeVar")


class WorkspaceType:
    """Workspace execution environment."""

    Host = HostWorkspaceConfig
    Docker = DockerWorkspaceConfig
    FlyIO = FlyIOWorkspaceConfig
    E2B = E2BWorkspaceConfig


class WorkspaceTemplate:

    @staticmethod
    def AnthropicComputer(
        composio_api_key: t.Optional[str] = None,
        composio_base_url: t.Optional[str] = None,
        github_access_token: t.Optional[str] = None,
        environment: t.Optional[t.Dict[str, str]] = None,
        persistent: bool = False,
        ports: t.Optional[t.Dict[int, t.Any]] = None,
    ) -> DockerWorkspaceConfig:
        # Configure ports
        ports = ports or {}
        ports.update({5900: 5900, 8501: 8501, 6080: 6080})

        # Configure environment
        environment = environment or {}
        environment["DISPLAY"] = ":1"

        return DockerWorkspaceConfig(
            composio_api_key=composio_api_key,
            composio_base_url=composio_base_url,
            github_access_token=github_access_token,
            environment=environment,
            persistent=persistent,
            image="composio/anthropic-computer:dev",
            ports=ports,
        )


class WorkspaceFactory:
    """Workspace factory class."""

    _recent: Workspace
    """Most recently used workspace"""

    _workspaces: t.Dict[str, Workspace] = {}
    """Collection of workspaces"""

    _lock: threading.Lock = threading.Lock()
    """Lock for `_recent`"""

    @classmethod
    def get_recent_workspace(cls) -> Workspace:
        """Get most recent workspace."""
        with cls._lock:
            return cls._recent

    @classmethod
    def set_recent_workspace(cls, workspace: Workspace) -> Workspace:
        """Get most recent workspace."""
        with cls._lock:
            cls._recent = workspace
        return workspace

    @classmethod
    def _initialize_workspace(cls, config: WorkspaceConfigType) -> Workspace:
        """Initialize a workspace from the config."""
        if isinstance(config, HostWorkspaceConfig):
            return HostWorkspace(config=config)

        if isinstance(config, DockerWorkspaceConfig):
            return DockerWorkspace(config=config)

        if isinstance(config, E2BWorkspaceConfig):
            return E2BWorkspace(config=config)

        if isinstance(config, FlyIOWorkspaceConfig):
            return FlyIOWorkspace(config=config)

        raise ValueError(f"Invalid workspace config: {config}")

    @classmethod
    def new(cls, config: WorkspaceConfigType) -> Workspace:
        """Create a new workspace."""
        logger = get_logger()
        logger.debug(f"Creating workspace with {config=}")
        workspace = cls._initialize_workspace(config=config)

        cls._workspaces[workspace.id] = workspace
        cls._workspaces[workspace.id].setup()
        return cls.set_recent_workspace(workspace=workspace)

    @classmethod
    def get(cls, id: t.Optional[str] = None) -> Workspace:
        """Get workspace by `id` or the most recent one."""
        if id is None:
            return cls.get_recent_workspace()

        if id not in cls._workspaces:
            raise ComposioSDKError(f"Workspace with ID: {id} not found.")

        workspace = cls._workspaces[id]
        return cls.set_recent_workspace(workspace=workspace)

    @classmethod
    def close(cls, id: str) -> None:
        """Teardown the workspace with given ID."""
        if id not in cls._workspaces:
            return
        workspace = cls._workspaces[id]
        if workspace.persistent:
            return

        workspace.teardown()

    @classmethod
    def teardown(cls) -> None:
        """Teardown the workspace factory."""
        logger = get_logger(name="atexit")
        if len(cls._workspaces) == 0:
            return

        logger.debug("Tearing down workspace factory")
        for workspace in cls._workspaces.values():
            if workspace.persistent:
                logger.debug("%s is a persistent workspace, skipping")
                continue

            logger.debug("Tearing down %s", workspace)
            workspace.teardown()


@atexit.register
def _teardown() -> None:
    """Teardown the workspace factory at exit."""
    WorkspaceFactory.teardown()
