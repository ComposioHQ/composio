from pydantic import Field

from .base_workspace_action import (
    BaseWorkspaceAction,
    BaseWorkspaceRequest,
    BaseWorkspaceResponse,
)


class WorkspaceStatusRequest(BaseWorkspaceRequest):
    workspace_id: str = Field(
        ...,
        description="workspace-id will be used to get status of the workspace",
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
    _tool_name = "workspacetool"
    _request_schema = WorkspaceStatusRequest
    _response_schema = WorkspaceStatusResponse

    def execute(
        self,
        request_data: WorkspaceStatusRequest,
        authorisation_data: dict,
    ) -> dict:
        # TODO: Implement shell status
        return {"output": "running"}
