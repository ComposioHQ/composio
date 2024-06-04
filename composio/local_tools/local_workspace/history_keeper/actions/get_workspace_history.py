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

STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"
logger = get_logger()

class GetWorkspaceHistoryRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id will be used to get status of the workspace"
    )

class GetWorkspaceHistoryResponse(BaseModel):
    workspace_history: dict = Field(
        ..., description="history of last n commands on the workspace"
    )

class GetWorkspaceHistory(Action):
    """
    returns history for workspace.
    History includes -
            - state of the environment
            - last executed n commands
            - output from last n commands
    """

    _history_maintains = True
    _display_name = "Get workspace history"
    _request_schema = GetWorkspaceHistoryRequest
    _response_schema = GetWorkspaceHistoryRequest
    _tags = ["workspace"]
    _tool_name = "historykeeper"
    _history_len = 5
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
        self, request_data: GetWorkspaceHistoryRequest, authorisation_data: dict = {}
    ) -> dict:
        if self.history_processor is None:
            logger.error("History processor is not set")
            raise ValueError("History processor is not set")

        return {
            "workspace_history": self.history_processor.get_history(
                workspace_id=request_data.workspace_id, n=self._history_len
            )
        }


class SaveWorkspaceHistoryRequest(BaseModel):
    issue_id: str = Field(..., description="issue id for which workspace history has to be saved")
    workspace_id: str = Field(
        ..., description="workspace-id will be used to get status of the workspace"
    )


class SaveWorkspaceHistoryResponse(BaseModel):
    output: str = Field(..., description="output from the history save function")


class SaveWorkspaceHistory(Action):
    """
    returns history for workspace.
    History includes -
            - state of the environment
            - last executed n commands
            - output from last n commands
    """

    _history_maintains = True
    _display_name = "Save workspace history"
    _request_schema = SaveWorkspaceHistoryRequest
    _response_schema = SaveWorkspaceHistoryResponse
    _tags = ["workspace"]
    _tool_name = "historykeeper"
    _history_len = 5
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
            self, request_data: SaveWorkspaceHistoryRequest, authorisation_data: dict = {}
    ) -> SaveWorkspaceHistoryResponse:
        if self.history_processor is None:
            logger.error("History processor is not set")
            raise ValueError("History processor is not set")
        workspace_history_path = self.history_processor.save_history_to_file(request_data.workspace_id,
                                                                             request_data.issue_id)

        return SaveWorkspaceHistoryResponse(output=f"history for workspace-id: {request_data.workspace_id} "
                f"is saved on path: {workspace_history_path}")


