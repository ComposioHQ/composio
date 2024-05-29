from collections import defaultdict
from functools import wraps

from composio.local_tools.local_workspace.commons.get_logger import get_logger


logger = get_logger()


class HistoryProcessor:
    def __init__(self):
        self.history = defaultdict(list)

    def log_command(self, workspace_id, command, output, state):
        entry = {"command": command, "output": output, "state": state}
        self.history[workspace_id].append(entry)

    def get_history(self, workspace_id, n=5):
        all_history = self.history.get(workspace_id, [])
        return all_history[-n:]


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
                # state = self.workspace_factory.get_workspace_state(workspace_id)
                state = None
                self.history_processor.log_command(
                    self.workspace_id, command, output, state
                )
            return output, return_code

        return wrapper

    return decorator
