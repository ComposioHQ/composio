from typing import Tuple

from pydantic import Field

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    communicate,
)
from composio.local_tools.local_workspace.commons.utils import (
    close_container,
    interrupt_container,
    process_output,
)

from .base_class import BaseAction, BaseRequest, BaseResponse


logger = get_logger()


class RunCommandOnWorkspaceRequest(BaseRequest):
    input_cmd: str = Field(
        ...,
        description="command to run in the shell. Ex. `ls -a` or `cd /home/user`",
        examples=["ls -a", "cd /home/user"],
    )
    timeout: int = Field(
        default=25,
        description="Timeout in seconds for the command to run."
        " If the command takes more than this, it will be terminated.",
        examples=[10, 30],
    )


class RunCommandOnWorkspaceResponse(BaseResponse):
    pass


class RunCommandOnWorkspace(BaseAction):
    """
      In general if you want to run any other command directly on shell, use this action.
      Few examples:
      1 - If you want to run python script, use this tool to run the python script. *NOTE* : while running a script, give complete path of the script.
      2 - Or if you want to `ls -a` use this tool to run the command.

    You should only include a *SINGLE* command in the command section and then wait for a response from the shell before continuing with more discussion and commands.
    If you'd like to issue two commands at once, PLEASE DO NOT DO THAT!
    You're free to use any other bash commands you want (e.g. find, grep, cat, ls, cd) in addition to the special commands listed above.
    However, the environment does NOT support interactive session commands (e.g. python, vim), so please do not invoke them.
    Never issue a find command against "/" directory. It will not work. Always try to find files within the base directory given in the task.
    """

    _display_name = "Run command"
    _request_schema = RunCommandOnWorkspaceRequest
    _response_schema = RunCommandOnWorkspaceResponse

    @history_recorder()
    def execute(
        self, request_data: RunCommandOnWorkspaceRequest, authorisation_data: dict = {}
    ):
        print("Executing command...")
        self._setup(request_data)
        print("Setup completed.")
        self.return_code = None

        output, return_code = self.run_command(
            action=request_data.input_cmd, timeout=request_data.timeout
        )
        output, return_code = process_output(output, return_code)
        return RunCommandOnWorkspaceResponse(output=output, return_code=return_code)

    def run_command(self, action: str, timeout: int) -> Tuple[str, int]:
        """
        Runs given action in environment and returns corresponding output

        Args:
            action (`str`) - command to run in bash shell

        Returns:
            observation (`str`) - output from container
            return_code (`int`) - return code from container
            done (`bool`) - whether task is over
            info (`dict`) - additional information (e.g. debugging information)
        """
        try:
            if self.container_process is None:
                logger.error("Container process is None")
                return "\nCONTAINER PROCESS IS NONE", 1
            output, return_code = communicate(
                self.container_process,
                self.container_obj,
                action,
                parent_pids=self.parent_pids,
                timeout_duration=timeout,
            )
            output, return_code = process_output(output, return_code)
            return (
                output,
                return_code,
            )
        except TimeoutError:
            try:
                self.interrupt()
                return "\nEXECUTION TIMED OUT", 1
            except RuntimeError as e:
                logger.warning(
                    "Failed to interrupt container: %s\nRESTARTING PROCESS.",
                    e,
                )
                self.close_container()
                return (
                    "\nEXECUTION TIMED OUT AND INTERRUPT FAILED. RESTARTING PROCESS.",
                    1,
                )
        except RuntimeError as e:
            logger.warning("Failed to execute command: %s\nRESTARTING PROCESS.", e)
            self.close_container()
            return "\nCOMMAND FAILED TO EXECUTE. RESTARTING PROCESS.", 1
        except BrokenPipeError as e:
            logger.error("Broken pipe error: %s\nRESTARTING PROCESS.", e)
            self.close_container()
            return "\nBROKEN PIPE ERROR. RESTARTING PROCESS.", 1
        except Exception as e:
            logger.error("cmd failed with exception: %s", e)
            return "\nEXECUTION FAILED OR COMMAND MALFORMED", 1

    def close_container(self) -> None:
        """
        called when a command failed to run on the local docker container.
        NOTE: this works here, as its a local container workspace,
              for docker on cloud, handle it appropriately
        """
        self.close()
        self.container_process = None
        self.container_obj = None

    def reset_container(self) -> None:
        self.close()
        self.container_process = None
        self.container_obj = None

    def close(self):
        close_container(self.container_process, self.container_obj)

    def interrupt(self):
        interrupt_container(self.container_process, self.container_obj)
