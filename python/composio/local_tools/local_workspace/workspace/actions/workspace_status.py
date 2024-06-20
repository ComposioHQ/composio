import docker
from pydantic import Field

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    get_container_name_from_workspace_id,
)

from .base_workspace_action import (
    BaseWorkspaceAction,
    BaseWorkspaceRequest,
    BaseWorkspaceResponse,
)


STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"
STATUS_NOT_FOUND = "not_found"
STATUS_ERROR = "error"
logger = get_logger()


class WorkspaceStatusRequest(BaseWorkspaceRequest):
    workspace_id: str = Field(
        ..., description="workspace-id will be used to get status of the workspace"
    )


class WorkspaceStatusResponse(BaseWorkspaceResponse):
    workspace_status: str = Field(
        ..., description="status of the workspace given in request"
    )


class WorkspaceStatusAction(BaseWorkspaceAction):
    """
    Returns the status of workspace given in the request
    """

    _display_name = "Get workspace status"
    _request_schema = WorkspaceStatusRequest
    _response_schema = WorkspaceStatusResponse

    def execute(
        self, request_data: WorkspaceStatusRequest, authorisation_data: dict
    ) -> BaseWorkspaceResponse:
        if authorisation_data is None:
            authorisation_data = {}
        if self.workspace_factory is None:
            raise ValueError("Workspace factory is not set")
        self.container_name = get_container_name_from_workspace_id(
            self.workspace_factory, request_data.workspace_id
        )
        client = docker.from_env()
        try:
            container = client.containers.get(self.container_name)
            if container.status == STATUS_RUNNING:
                return WorkspaceStatusResponse(workspace_status=STATUS_RUNNING)
            return WorkspaceStatusResponse(workspace_status=STATUS_STOPPED)
        except docker.errors.NotFound:
            return WorkspaceStatusResponse(workspace_status=STATUS_NOT_FOUND)
        except docker.errors.APIError as e:
            logger.error("Error checking container status: %s", e)
            return WorkspaceStatusResponse(workspace_status=STATUS_STOPPED)
