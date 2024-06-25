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
    patch_code: str = Field(
        ...,
        description="patch code that needs to be submitted - this should be a valid patch in diff format for the workspace.",
    )


class SubmitPatchResponse(BaseModel):
    patch_code: str = Field(..., description="patch code that is generated")


class SubmitPatch(Action):
    """
    Submits generated patch for the workspace that should work This should be in diff format.
    Example:
    --- a/file.txt
    +++ b/file.txt
    @@ -1,3 +1,3 @@
    -Hello, World!
    +Hello, Python!
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
    ) -> SubmitPatchResponse:
        return SubmitPatchResponse(patch_code=request_data.patch_code)
