"""Tool for executing shell commands."""

import typing as t

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT


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
        ...,
        description="Errors captured during execution of the command",
    )
    exit_code: int = Field(
        ...,
        description="Exit code of the command",
    )
    current_shell_pwd: str = Field(
        default="",
        description="Current shell's working directory",
    )


class ExecCommand(LocalAction[ShellExecRequest, ShellExecResponse]):
    """
    Run any command directly on shell.
    Examples:
      1. If you want to run python script, use this tool to run the python
        script. *NOTE* : while running a script, give complete path of the script.
      2. Or if you want to `ls -a` use this tool to run the command.
      3. Or if you want to `cd` to a directory, use this tool to run the command.

    You should only include a SINGLE command in the command section and then
    wait for a response from the shell before continuing with more discussion
    and commands.

    You're free to use any other bash commands you want (e.g. find, grep, cat,
    ls, cd) in addition to the special commands listed above. However, the
    environment does NOT support interactive session commands (e.g. python,
    vim), so please do not invoke them. Never issue a find command against "/"
    directory. It will not work. Always try to find files within the base
    directory given in the task.
    """

    _tags = ["workspace", "shell"]

    def execute(self, request: ShellExecRequest, metadata: t.Dict) -> ShellExecResponse:
        """Execute a shell command."""
        shell = self.shells.get(id=request.shell_id)
        self.logger.debug(f"Executing {request.cmd} @ {shell}")

        output = shell.exec(cmd=request.cmd)
        self.logger.debug(output)
        return ShellExecResponse(
            stdout=output[STDOUT],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
            current_shell_pwd=f"Currently in {shell.exec(cmd='pwd')[STDOUT].strip()}",
        )
