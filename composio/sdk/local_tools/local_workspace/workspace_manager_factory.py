from uuid import uuid4
from typing import Dict, Optional, Any
from pydantic.v1 import BaseModel

from tools.services.swelib.local_workspace.local_docker_workspace import LocalDockerWorkspace, LocalDockerArgumentsModel


TYPE_WORKSPACE_LOCAL_DOCKER = "local_docker"

KEY_WORKSPACE_MANAGER = "workspace"
KEY_CONTAINER_NAME = "container_name"
KEY_PARENT_PIDS = "parent_pids"
KEY_IMAGE_NAME = "image_name"


class GetWorkspaceManagerRequest(BaseModel):
    image_name: str
    timeout: int = 35
    verbose: bool = False
    # Custom environment setup. Currently only used when data_path points to a single issue.
    # This needs to be either a string pointing to a yaml file (with yaml, yml file extension)
    # or a shell script (with sh extension).
    # See https://github.com/princeton-nlp/SWE-agent/pull/153 for more information
    environment_setup: Optional[str] = None


class WorkspaceManagerFactory:
    _registry: Dict[str, Any] = {}

    @staticmethod
    def get_workspace_manager(args: LocalDockerArgumentsModel) -> str:
        # currently we only support local docker
        workspace_type = TYPE_WORKSPACE_LOCAL_DOCKER
        if workspace_type == TYPE_WORKSPACE_LOCAL_DOCKER:
            workspace_manager = LocalDockerWorkspace(args)
            container_name = workspace_manager.container_name
            parent_pids = workspace_manager.parent_pids
            workspace_id = str(uuid4())
            WorkspaceManagerFactory._registry[workspace_id] = {KEY_WORKSPACE_MANAGER: workspace_manager,
                                                               KEY_CONTAINER_NAME: container_name,
                                                               KEY_PARENT_PIDS: parent_pids,
                                                               KEY_IMAGE_NAME: args.image_name}
            return workspace_id
        else:
            raise ValueError(f"Unknown workspace manager type: {workspace_type}")

    @staticmethod
    def get_registered_manager(workspace_id: str) -> Dict[str, Any]:
        return WorkspaceManagerFactory._registry.get(workspace_id)

    @staticmethod
    def remove_workspace_manager(workspace_id: str) -> None:
        if workspace_id in WorkspaceManagerFactory._registry:
            del WorkspaceManagerFactory._registry[workspace_id]

    @staticmethod
    def list_workspace_managers() -> Dict[str, LocalDockerWorkspace]:
        return WorkspaceManagerFactory._registry
