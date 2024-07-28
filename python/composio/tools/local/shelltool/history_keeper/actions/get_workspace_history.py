from re import L
from pydantic import BaseModel, Field

from composio.tools.local.base import Action
from composio.tools.local.shelltool.shell_exec.actions.exec import ShellExecRequest
from composio.utils.logging import get as get_logger
import subprocess
import os
import time

STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"
logger = get_logger("workspace")


def get_history_file():
    zsh_file =  os.path.expanduser('~/.zsh_history')
    bash_file =  os.path.expanduser('~/.bash_history')
    fish_file = os.path.expanduser('~/.config/fish/fish_history')
    try:
        with open(zsh_file, 'r', encoding='utf-8', errors='replace') as file:
            return zsh_file
    except Exception as e:
        print(f"Failed to get history file: {e}")
    
    try:
        with open(bash_file, 'r', encoding='utf-8', errors='replace') as file:
            return bash_file
    except Exception as e:
        print(f"Failed to get history file: {e}")

    try:
        with open(fish_file, 'r', encoding='utf-8', errors='replace') as file:
            return fish_file
    except Exception as e:
        print(f"Failed to get fish history file: {e}")
    
    return None
    

def format_timestamp(command_time):
    current_time = time.time()
    elapsed_seconds = current_time - float(command_time.replace(': ', '').replace(':0', ''))
    minutes = int(elapsed_seconds // 60)
    seconds = int(elapsed_seconds % 60)
    return f"{minutes} mins {seconds} secs ago"

class GetWorkspaceHistoryRequest(BaseModel):
    last_n_commands: int = Field(
        ..., description="Number of last commands to fetch"
    )


class GetWorkspaceHistoryResponse(BaseModel):
    is_success: bool = Field(
        ..., description="Whether the history fetch was successful"
    )
    workspace_command_history: list[str] = Field(
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
        import os

        history_file = '~/.zsh_history'
        full_path = os.path.expanduser(history_file)

        try:
            with open(full_path, 'r', encoding='utf-8', errors='replace') as file:
                history = file.readlines()[-request_data.last_n_commands:]  # Fetch the last n commands based on the request
            commands = [{
                "execute_time_ago": format_timestamp(command.split(';')[0]),
                "command": command.split(';')[1].strip()
            } for command in history[-2:]]
            return {
                "workspace_command_history": commands,
                "is_success": True
            }
        except Exception as e:
            print(f"Error reading history file: {e}")
            return {
                "workspace_command_history": [],
                "is_success": False,
                "error": str(e)
            }
