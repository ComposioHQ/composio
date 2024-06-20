import json
import os
from collections import defaultdict
from datetime import datetime
from functools import wraps
from pathlib import Path

from composio.local_tools.local_workspace.commons.get_logger import get_logger


logger = get_logger()
script_path = Path(__file__)
script_dir = script_path.parent


class HistoryProcessor:
    def __init__(self):
        self.history = defaultdict(list)
        self.date_time_folder = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.base_dir = ""

    def make_submission_dir(self):
        # make submit_path directory
        try:
            base_dir = script_dir / Path(self.date_time_folder)
            if not os.path.exists(base_dir):
                os.makedirs(base_dir)
            self.base_dir = base_dir
        except Exception as e:
            raise Exception("error in making submit-path directory") from e

    def log_command(self, workspace_id, command, output, state):
        entry = {"command": command, "output": output, "state": state}
        self.history[workspace_id].append(entry)

    def get_history(self, workspace_id, n=5):
        all_history = self.history.get(workspace_id, [])
        return all_history[-n:]

    def save_history_to_file(self, workspace_id: str, instance_id: str) -> str:
        # make the submission dir if it doesn't exist
        self.make_submission_dir()
        # Define the file path using instance-id and ensure it's unique per workspace
        file_path = self.base_dir / Path(f"{workspace_id}_instance_{instance_id}.json")
        history_logs = self.history.get(workspace_id, [])
        with open(file_path, "w", encoding="utf-8") as file:
            json.dump(history_logs, file)
        return file_path.name


def history_recorder():
    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            output, return_code = func(self, *args, **kwargs)
            if hasattr(self, "history_processor") and hasattr(self, "workspace_id"):
                command = ""
                if hasattr(self, "command"):
                    command = self.command + " " + args[0].json()
                else:
                    logger.error(
                        "command is not set in command-runner action class. History will have empty command for this"
                    )
                # Assume the state check and logging are meant to be done after the command execution
                # state = self.workspace_factory.get_workspace_state(self.workspace_id)
                state = None
                self.history_processor.log_command(
                    self.workspace_id, command, output, state
                )
            return output, return_code

        return wrapper

    return decorator
