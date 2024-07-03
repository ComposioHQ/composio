import json
import typing as t
from enum import Enum

from composio.tools.env.base import Workspace
from composio.tools.env.docker import (
    DockerIoClient,
    DockerWorkspace,
    LocalDockerArgumentsModel,
    get_default_docker_env,
)
from composio.tools.env.e2b import E2BClient
from composio.utils.logging import WithLogger


KEY_WORKSPACE_MANAGER = "workspace"
KEY_CONTAINER_NAME = "container_name"
KEY_PARENT_PIDS = "parent_pids"
KEY_IMAGE_NAME = "image_name"
KEY_WORKSPACE_ID = "workspace_id"
KEY_WORKSPACE_TYPE = "type"


class WorkspaceType(Enum):
    DOCKER = "docker"
    E2B = "e2b"
    FLYIO = "flyio"
    LOCAL = "local"


class WorkspaceFactory(WithLogger):
    """Workspace factory class."""

    _instance = None  # Singleton instance
    docker_client = None
    e2b_client = None
    _registry: t.Dict[str, t.Any] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(WorkspaceFactory, cls).__new__(cls)
            cls._instance.docker_client = DockerIoClient()
            cls._instance.e2b_client = E2BClient()
            cls._instance._registry = {}
        return cls._instance

    @classmethod
    def get_instance(cls):
        """Get the singleton instance of the WorkspaceFactory."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def create_workspace(
        self,
        workspace_type: WorkspaceType,
        local_docker_args: LocalDockerArgumentsModel,
        **kwargs,
    ) -> Workspace:
        self.logger.debug("kwargs: %s", json.dumps(kwargs))
        if workspace_type == WorkspaceType.DOCKER:
            workspace = DockerWorkspace(
                local_docker_args.image_name,
                self.docker_client,
                local_docker_args,
            )
            workspace.setup(
                env=get_default_docker_env(),
            )
            self._registry[workspace.workspace_id] = {
                KEY_WORKSPACE_MANAGER: workspace,
                KEY_CONTAINER_NAME: workspace.container_name,
                KEY_PARENT_PIDS: workspace.parent_pids,
                KEY_IMAGE_NAME: local_docker_args.image_name,
                KEY_WORKSPACE_TYPE: WorkspaceType.DOCKER,
            }
            return workspace
        raise ValueError(f"Unsupported workspace type: {workspace_type}")

    def get_registered_manager(
        self, workspace_id: str
    ) -> t.Optional[t.Dict[str, t.Any]]:
        return self._registry.get(workspace_id)

    def get_workspace_by_id(self, workspace_id: str) -> Workspace:
        workspace_meta = self._registry.get(workspace_id)
        if not workspace_meta:
            raise ValueError(f"workspace not found, workspace-id: {workspace_id}")
        workspace = workspace_meta[KEY_WORKSPACE_MANAGER]
        return workspace

    def remove_workspace_manager(self, workspace_id: str) -> None:
        if workspace_id in self._registry:
            del self._registry[workspace_id]

    def list_workspace_managers(self) -> t.Dict[str, t.Any]:
        return self._registry
