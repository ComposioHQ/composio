from pydantic import Field

from composio.tools.base.local import LocalAction

from .base_workspace_action import BaseWorkspaceRequest, BaseWorkspaceResponse


class WorkspaceStatusRequest(BaseWorkspaceRequest):
    workspace_id: str = Field(
        ...,
        description="workspace-id will be used to get status of the workspace",
    )


class WorkspaceStatusResponse(BaseWorkspaceResponse):
    workspace_status: str = Field(
        ..., description="status of the workspace given in request"
    )


class WorkspaceStatusAction(
    LocalAction[
        WorkspaceStatusRequest,
        WorkspaceStatusResponse,
    ]
):
    """
    Returns the status of workspace given in the request
    """

    def execute(
        self, request: WorkspaceStatusRequest, metadata: dict
    ) -> WorkspaceStatusResponse:
        # TODO: Implement shell status
        return WorkspaceStatusResponse(workspace_status="runinng")
