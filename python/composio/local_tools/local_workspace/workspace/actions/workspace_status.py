from pydantic import Field, BaseModel
from typing import TypeVar, Optional

from composio.core.local import Action
from abc import ABC
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.workspace.workspace_factory import WorkspaceFactory
from composio.workspace.base_workspace import Workspace


logger = get_logger("workspace")

RequestType = TypeVar("RequestType", bound=BaseModel)
ResponseType = TypeVar("ResponseType", bound=BaseModel)


class WorkspaceStatusRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id will be used to get status of the workspace"
    )


class WorkspaceStatusResponse(BaseModel):
    workspace_status: str = Field(
        ..., description="status of the workspace given in request"
    )


class WorkspaceStatusAction(Action[RequestType, ResponseType], ABC):
    """
    Returns the status of workspace given in the request
    """

    _display_name = "Get workspace status"
    _request_schema = WorkspaceStatusRequest
    _response_schema = WorkspaceStatusResponse
    workspace: Optional[Workspace] = None

    def execute(
        self, request_data: WorkspaceStatusRequest, authorisation_data: dict
    ) -> dict:
        authorisation_data = {} if not authorisation_data else authorisation_data
        self.workspace = WorkspaceFactory.get_instance().get_registered_manager(request_data.workspace_id)
        if not self.workspace:
            raise ValueError(
                f"workspace not found for workspace_id: {request_data.workspace_id}"
            )
        status = self.workspace.get_running_status()
        return {"output": f"docker container running status is {status}"}
