from pydantic import Field

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from .base_class import BaseAction, BaseRequest, BaseResponse


logger = get_logger()


class SubmitPatchRequest(BaseRequest):
    workspace_id: str = Field(..., description="workspace-id for which patch is generated")
    issue_id: str = Field(..., description="issue-id for which the patch has been generated and needs to be submitted")


class SubmitPatchResponse(BaseResponse):
    output: str = Field(..., description="output for submit patch")


class SubmitPatchCmd(BaseAction):
    """
    submits the patch for given issue-id and workspace-id
    """

    _history_maintains: bool = True
    _display_name = "submit patch action"
    _request_schema = SubmitPatchRequest
    _response_schema = SubmitPatchResponse
    command = "submit_patch"

    @history_recorder()
    def execute(
        self, request_data: SubmitPatchRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)

        if self.container_process is None:
            raise ValueError("Container process is not set")

        history_file_name = self.history_processor.save_history_to_file(request_data.workspace_id,
                                                                        request_data.issue_id)

        return BaseResponse(output=f"generated patch is submitted, and "
                                          f"the history of workspace is copied to path: {history_file_name}")
