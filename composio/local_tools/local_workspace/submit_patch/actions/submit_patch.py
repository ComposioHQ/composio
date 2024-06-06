from typing import Optional

from pydantic import BaseModel, Field

from composio.core.local import Action
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    WorkspaceManagerFactory,
)

logger = get_logger()


class SubmitPatchRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id for which patch is generated"
    )
    patch_code: str = Field(..., description="patch code that needs to bu submitted")


class SubmitPatchResponse(BaseModel):
    patch_code: str = Field(..., description="patch code that is generated")


class SubmitPatch(Action):
    """
    submits generated patch for the workspace
    """

    _history_maintains = True
    _display_name = "Submit Generated patch"
    _request_schema = SubmitPatchRequest
    _response_schema = SubmitPatchResponse
    _tags = ["workspace"]
    _tool_name = "submitpatchtool"
    workspace_factory: Optional[WorkspaceManagerFactory] = None
    history_processor: Optional[HistoryProcessor] = None

    def set_workspace_and_history(
        self,
        workspace_factory: WorkspaceManagerFactory,
        history_processor: HistoryProcessor,
    ):
        self.workspace_factory = workspace_factory
        self.history_processor = history_processor

    def execute(
        self, request_data: SubmitPatchRequest, authorisation_data: dict = {}
    ) -> dict:
        return SubmitPatchResponse(patch_code=request_data.patch_code)