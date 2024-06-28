from pydantic import Field

from composio.local_tools.local_workspace.commons.get_logger import get_logger

from .base_workspace_action import (
    BaseWorkspaceAction,
    BaseWorkspaceRequest,
    BaseWorkspaceResponse,
)

logger = get_logger("workspace")


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
        status = self.workspace.get_running_status()
        return BaseWorkspaceResponse(output=f"docker container running status is {status}")
