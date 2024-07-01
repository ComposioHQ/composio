from typing import Tuple

from pydantic import Field

from composio.local_tools.local_workspace.base_cmd import (
    BaseAction,
    BaseRequest,
    BaseResponse,
)
from composio.workspace.base_workspace import BaseCmdResponse
from composio.workspace.get_logger import get_logger


logger = get_logger("workspace")


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
    _tool_name = "shellcmdtool"
    _request_schema = RunCommandOnWorkspaceRequest
    _response_schema = RunCommandOnWorkspaceResponse

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
            cmd_response: BaseCmdResponse = self._communicate(action, timeout)
            return (
                cmd_response.output,
                cmd_response.return_code,
            )
        except TimeoutError:
            try:
                return "\nEXECUTION TIMED OUT", 1
            except RuntimeError as e:
                logger.warning(
                    "Failed to interrupt container: %s\nRESTARTING PROCESS.",
                    e,
                )
                return (
                    "\nEXECUTION TIMED OUT AND INTERRUPT FAILED. RESTARTING PROCESS.",
                    1,
                )
        except RuntimeError as e:
            logger.warning("Failed to execute command: %s\nRESTARTING PROCESS.", e)
            return "\nCOMMAND FAILED TO EXECUTE. RESTARTING PROCESS.", 1
        except BrokenPipeError as e:
            logger.error("Broken pipe error: %s\nRESTARTING PROCESS.", e)
            return "\nBROKEN PIPE ERROR. RESTARTING PROCESS.", 1
        except Exception as e:
            logger.error("cmd failed with exception: %s", e)
            return "\nEXECUTION FAILED OR COMMAND MALFORMED", 1


class GetCurrentDirRequest(BaseRequest):
    pass


class GetCurrentDirResponse(BaseResponse):
    pass


class GetCurrentDirCmd(BaseAction):
    """
    Gets the current directory. This is equivalent to running 'pwd' in the terminal.
    """

    _display_name = "Get Current Directory Action"
    _request_schema = GetCurrentDirRequest
    _response_schema = GetCurrentDirResponse

    def execute(
        self, request_data: GetCurrentDirRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)
        return self._communicate("pwd")
