import typing as t
from uuid import uuid4

from composio.workspace import DockerWorkspace, E2BWorkspace
from composio.workspace.workspace_clients import DockerIoClient, E2BClient, WorkspaceType

KEY_WORKSPACE_MANAGER = "workspace"
KEY_CONTAINER_NAME = "container_name"
KEY_PARENT_PIDS = "parent_pids"
KEY_IMAGE_NAME = "image_name"
KEY_WORKSPACE_ID = "workspace_id"
KEY_WORKSPACE_TYPE = "type"


class WorkspaceFactory:
    def __init__(self):
        self.docker_client = DockerIoClient()
        self.e2b_client = E2BClient()
        self._registry = {}

    def create_workspace(self, workspace_type: WorkspaceType, args) -> str:
        if workspace_type == WorkspaceType.DOCKER:
            workspace = DockerWorkspace(args, self.docker_client)
            container_name = workspace.container_name
            parent_pids = workspace.parent_pids
            workspace_id = str(uuid4())
            self._registry[workspace_id] = {
                KEY_WORKSPACE_MANAGER: workspace,
                KEY_CONTAINER_NAME: container_name,
                KEY_PARENT_PIDS: parent_pids,
                KEY_IMAGE_NAME: args.image_name,
                KEY_WORKSPACE_TYPE: WorkspaceType.DOCKER,
            }
            return workspace_id
        elif workspace_type == WorkspaceType.E2B:
            workspace = E2BWorkspace(args, self.e2b_client)
            workspace_id = str(uuid4())
            self._registry[workspace_id] = {
                KEY_WORKSPACE_MANAGER: workspace,
                KEY_WORKSPACE_TYPE: WorkspaceType.DOCKER,
            }
        else:
            raise ValueError(f"Unsupported workspace type: {workspace_type}")

        return None

    def get_registered_manager(self, workspace_id: str) -> t.Optional[t.Dict[str, t.Any]]:
        return self._registry.get(workspace_id)

    def remove_workspace_manager(self, workspace_id: str) -> None:
        if workspace_id in self._registry:
            del self._registry[workspace_id]

    def list_workspace_managers(self) -> t.Dict[str, t.Any]:
        return self._registry
