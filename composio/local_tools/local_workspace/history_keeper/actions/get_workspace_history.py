from pydantic import BaseModel, Field

from composio.local_tools.action import Action
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

    _display_name = "Get workspace history"
    _request_schema = GetWorkspaceHistoryRequest
    _response_schema = GetWorkspaceHistoryRequest
    _tags = ["workspace"]
    _history_len = 5
    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def set_workspace_and_history(
        self,
        workspace_factory: WorkspaceManagerFactory,
        history_processor: HistoryProcessor,
    ):
        self.workspace_factory = workspace_factory
        self.history_processor = history_processor

    def execute(
        self, request_data: GetWorkspaceHistoryRequest, authorisation_data: dict = {}
    ):
        return self.history_processor.get_history(
            workspace_id=request_data.workspace_id, n=self._history_len
        )

    def get_history_n(self):
        """
        Returns:
        """
        return
