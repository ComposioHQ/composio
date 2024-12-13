"""Tool for executing bash commands in a persistent session."""

import typing as t

from pydantic import BaseModel, Field

from composio.tools.base.exceptions import ExecutionFailed
from composio.tools.base.local import LocalAction
from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT


class BashRequest(BaseModel):
    """Bash request abstraction."""

    command: str = Field(
        ...,
        description="Bash command to be executed.",
    )
    session_id: t.Optional[str] = Field(
        default=None,
        description=(
            "ID of the bash session where this command will be executed. "
            "If not provided, the most recently used shell will be used to "
            "execute the command."
        ),
    )
    restart: bool = Field(
        False,
        description="If True, restart the bash session before executing the command.",
    )


class BashResponse(BaseModel):
    """Bash execution response."""

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
    session_id: t.Optional[str] = Field(
        None,
        description="ID of the bash session used for this command",
    )


class BashCommand(LocalAction[BashRequest, BashResponse]):
    """
    Run bash commands in a persistent session.

    This tool allows you to execute bash commands in a persistent session,
    maintaining state between commands. You can also restart the session
    if needed.

    Examples:
      1. Run a simple command: `ls -l`
      2. Set a variable and use it: `x=5; echo $x`
      3. Use pipes and redirections: `cat file.txt | grep "pattern" > output.txt`

    Note: Interactive commands or those requiring user input during execution
    are not supported and may cause the command to hang or timeout.
    """

    _tags = ["workspace", "bash"]

    def execute(self, request: BashRequest, metadata: t.Dict) -> BashResponse:
        """Execute a bash command."""
        try:
            if "firefox" not in request.command:
                output = self.shells.get(id=request.session_id).exec(
                    cmd=request.command
                )
                return BashResponse(
                    stdout=output[STDOUT],
                    stderr=output[STDERR],
                    exit_code=output[EXIT_CODE],
                    session_id=request.session_id,
                )

            output = self.shells.new().exec(cmd=request.command, wait=False)
            return BashResponse(
                stdout=output[STDOUT],
                stderr=output[STDERR],
                exit_code=output[EXIT_CODE],
                session_id=request.session_id,
            )
        except ExecutionFailed as e:
            return BashResponse(
                stdout="",
                stderr=str(e),
                exit_code=1,
                session_id=request.session_id,
            )
