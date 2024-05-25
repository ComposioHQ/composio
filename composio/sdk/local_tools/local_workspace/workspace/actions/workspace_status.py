from pydantic.v1 import BaseModel, Field
import docker

from composio.sdk.local_tools.local_workspace.get_logger import get_logger
from composio.sdk.local_tools.local_workspace.utils import get_container_name_from_workspace_id


STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"
logger = get_logger()


class WorkspaceStatusRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id will be used to get status of the workspace")


class WorkspaceStatusResponse(BaseModel):
    workspace_status: str = Field(..., description="status of the workspace given in request")


class WorkspaceStatus:
    """
        returns the status of workspace given in the request
    """
    _display_name = "Get workspace status"
    _request_schema = WorkspaceStatusRequest
    _response_schema = WorkspaceStatusResponse
    _tags = ["workspace"]

    def _setup(self, args: WorkspaceStatusRequest):
        self.container_name = get_container_name_from_workspace_id(args.workspace_id)

    def execute(self, request_data: _request_schema, authorisation_data: dict = {}):
        self._setup(request_data)
        client = docker.from_env()
        try:
            container = client.containers.get(self.container_name)
            if container.status == STATUS_RUNNING:
                return WorkspaceStatusResponse(container_status=STATUS_RUNNING)
            else:
                return WorkspaceStatusResponse(container_status=STATUS_STOPPED)
        except docker.errors.NotFound:
            return False
        except docker.errors.APIError as e:
            logger.error(f"Error checking container status: {e}")
            return WorkspaceStatusResponse(container_status=STATUS_STOPPED)

