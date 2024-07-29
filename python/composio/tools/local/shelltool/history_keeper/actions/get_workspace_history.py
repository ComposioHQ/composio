import os
import subprocess
import time
from datetime import datetime
from re import L

from pydantic import BaseModel, Field

from composio.tools.local.base import Action
from composio.utils.logging import get as get_logger


STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"
logger = get_logger("workspace")


def format_timestamp(command_time):
    current_time = datetime.now()
    elapsed_seconds = (current_time - command_time).total_seconds()
    minutes = int(elapsed_seconds // 60)
    seconds = int(elapsed_seconds % 60)
    return f"{minutes} mins {seconds} secs ago"


class CommandHistory(BaseModel):
    executed_time_ago: str = Field(..., description="executed at")
    command: str = Field(..., description="command")


class GetWorkspaceHistoryRequest(BaseModel):
    last_n_commands: int = Field(..., description="Number of last commands to fetch")
    shell_id: str = Field(..., description="shell id")


class GetWorkspaceHistoryResponse(BaseModel):
    is_success: bool = Field(
        ..., description="Whether the history fetch was successful"
    )
    workspace_command_history: list[CommandHistory] = Field(
        ..., description="history of last n commands on the workspace"
    )
    error: str = Field(
        ..., description="Error message if the history fetch was not successful"
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
        print("execute")
        print(authorisation_data)
        shell = authorisation_data.get("workspace").shells.get(id=request_data.shell_id)  # type: ignore

        workspace_command_history = [
            CommandHistory(
                executed_time_ago=format_timestamp(command["executed_at"]),
                command=command["cmd"],
            )
            for command in shell.execute_commands[-request_data.last_n_commands :]
        ]
        return {
            "workspace_command_history": workspace_command_history,
            "is_success": True,
        }
