from typing import Dict

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.shelltool.shell_exec.actions.exec import ShellExecRequest
from composio.utils.logging import get as get_logger


STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"
logger = get_logger("workspace")


class GetWorkspaceHistoryRequest(ShellExecRequest):
    pass


class GetWorkspaceHistoryResponse(BaseModel):
    workspace_history: dict = Field(
        ...,
        description="history of last n commands on the workspace",
    )


class GetWorkspaceHistory(
    LocalAction[
        GetWorkspaceHistoryRequest,
        GetWorkspaceHistoryResponse,
    ]
):
    """
    Returns history for workspace which includes
        - state of the environment
        - last executed n commands
        - output from last n commands
    """

    _tags = ["workspace"]
    _history_len = 5

    def execute(
        self, request: GetWorkspaceHistoryRequest, metadata: Dict
    ) -> GetWorkspaceHistoryResponse:
        return GetWorkspaceHistoryResponse(workspace_history={})
