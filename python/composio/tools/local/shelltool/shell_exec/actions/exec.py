"""Tool for executing shell commands."""

import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.base import Action
from composio.utils.logging import get as get_logger


class ShellRequest(BaseModel):
    """Shell request abstraction."""

    shell_id: str = Field(
        default="",
        description=(
            "ID of the shell where this command will be executed, if not "
            "provided the recent shell will be used to execute the action"
        ),
    )


class ShellExecRequest(ShellRequest):
    """Execute command request."""

    cmd: str = Field(
        ...,
        description="Command to be executed.",
    )


class ShellExecResponse(BaseModel):
    """Shell execution response."""

    stdout: str = Field(
        ...,
        description="Output captured from the execution of the command",
    )
    stderr: str = Field(
        ..., description="Errors captured during execution of the command"
    )


class BaseExecCommand(Action):
    """
    Run any command directly on shell.
    Examples:
      1. If you want to run python script, use this tool to run the python
        script. *NOTE* : while running a script, give complete path of the script.
      2. Or if you want to `ls -a` use this tool to run the command.
      3. Or if you want to `cd` to a directory, use this tool to run the command.

    You should only include a *SINGLE* command in the command section and then
    wait for a response from the shell before continuing with more discussion
    and commands. If you'd like to issue two commands at once, PLEASE DO NOT DO THAT!

    You're free to use any other bash commands you want (e.g. find, grep, cat,
    ls, cd) in addition to the special commands listed above. However, the
    environment does NOT support interactive session commands (e.g. python,
    vim), so please do not invoke them. Never issue a find command against "/"
    directory. It will not work. Always try to find files within the base
    directory given in the task.
    """

    _tool_name = "shell"
    _tags = ["workspace", "shell"]

    run_on_shell = True


class ExecCommand(BaseExecCommand):
    """
    Run any command directly on shell.
    Examples:
      1. If you want to run python script, use this tool to run the python
        script. *NOTE* : while running a script, give complete path of the script.
      2. Or if you want to `ls -a` use this tool to run the command.
      3. Or if you want to `cd` to a directory, use this tool to run the command.

    You should only include a *SINGLE* command in the command section and then
    wait for a response from the shell before continuing with more discussion
    and commands. If you'd like to issue two commands at once, PLEASE DO NOT DO THAT!

    You're free to use any other bash commands you want (e.g. find, grep, cat,
    ls, cd) in addition to the special commands listed above. However, the
    environment does NOT support interactive session commands (e.g. python,
    vim), so please do not invoke them. Never issue a find command against "/"
    directory. It will not work. Always try to find files within the base
    directory given in the task.
    """

    _display_name = "Execute command"
    _tool_name = "shell"
    _request_schema = ShellExecRequest
    _response_schema = ShellExecResponse
    _tags = ["workspace", "shell"]

    def execute(
        self,
        request_data: ShellExecRequest,
        authorisation_data: dict,
    ) -> ShellExecResponse:
        """Execute a shell command."""
        shell = authorisation_data.get("workspace").shells.get(id=request_data.shell_id)  # type: ignore
        self.logger.debug(f"Executing {request_data.cmd} @ {shell}")
        output = shell.exec(cmd=request_data.cmd)
        return ShellExecResponse(stdout=output["stdout"], stderr=output["stderr"])


def exec_cmd(
    cmd: str, authorisation_data: dict, shell_id: t.Optional[str] = None
) -> t.Dict[str, str]:
    """Execute a shell command."""
    shell_id = shell_id or ""
    shell = authorisation_data.get("workspace").shells.get(id=shell_id if len(shell_id) > 0 else None)  # type: ignore
    get_logger(name="exec_cmd").debug(f"Executing {cmd} @ {shell}")
    return shell.exec(cmd=cmd)
