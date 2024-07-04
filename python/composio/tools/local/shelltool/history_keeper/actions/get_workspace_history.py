from pydantic import BaseModel, Field

from composio.tools.local.base import Action
from composio.tools.local.shelltool.shell_exec.actions.exec import ShellExecRequest
from composio.tools.local.shelltool.utils import get_logger


STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"
logger = get_logger("workspace")


class GetWorkspaceHistoryRequest(ShellExecRequest):
    pass


class GetWorkspaceHistoryResponse(BaseModel):
    workspace_history: dict = Field(
        ..., description="history of last n commands on the workspace"
    )


class GetWorkspaceHistory(
    Action[GetWorkspaceHistoryRequest, GetWorkspaceHistoryResponse]
):
    """
    returns history for workspace.
    History includes -
            - state of the environment
            - last executed n commands
            - output from last n commands
    """

    _display_name = "Get workspace history"
    _tags = ["workspace"]
    _tool_name = "historyfetchertool"
    _request_schema = GetWorkspaceHistoryRequest
    _response_schema = GetWorkspaceHistoryResponse
    _history_len = 5

    def execute(
        self,
        request_data: GetWorkspaceHistoryRequest,
        authorisation_data: dict,
    ) -> dict:
        return {}
