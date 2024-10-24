"""Tool for executing bash commands in a persistent session."""

import asyncio
import os
import typing as t

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.base.exceptions import ExecutionFailed
from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT


class BashSession:
    """A session of a bash shell."""

    _process: asyncio.subprocess.Process
    _output_delay: float = 0.2  # seconds
    _timeout: float = 120.0  # seconds
    _sentinel: str = "<<exit>>"

    async def start(self):
        self._process = await asyncio.create_subprocess_shell(
            "/bin/bash",
            preexec_fn=os.setsid,
            shell=True,
            bufsize=0,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

    def stop(self):
        """Terminate the bash shell."""
        if self._process.returncode is None:
            self._process.terminate()

    async def run(self, command: str) -> t.Dict[str, t.Any]:
        """Execute a command in the bash shell."""
        if self._process.returncode is not None:
            raise ExecutionFailed(f"Bash session has exited with returncode {self._process.returncode}")

        assert self._process.stdin
        assert self._process.stdout
        assert self._process.stderr

        self._process.stdin.write(
            command.encode() + f"; echo '{self._sentinel}'\n".encode()
        )
        await self._process.stdin.drain()

        try:
            async with asyncio.timeout(self._timeout):
                while True:
                    await asyncio.sleep(self._output_delay)
                    output = self._process.stdout._buffer.decode()
                    if self._sentinel in output:
                        output = output[: output.index(self._sentinel)]
                        break
        except asyncio.TimeoutError:
            raise ExecutionFailed(f"Command timed out after {self._timeout} seconds")

        error = self._process.stderr._buffer.decode()

        self._process.stdout._buffer.clear()
        self._process.stderr._buffer.clear()

        return {
            STDOUT: output.strip(),
            STDERR: error.strip(),
            EXIT_CODE: 0 if not error else 1,
        }


class BashRequest(BaseModel):
    """Bash request abstraction."""

    session_id: str = Field(
        default="",
        description=(
            "ID of the bash session where this command will be executed. "
            "If not provided, a new session will be created."
        ),
    )
    command: str = Field(
        ...,
        description="Bash command to be executed.",
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
    session_id: str = Field(
        ...,
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
    _sessions: t.Dict[str, BashSession] = {}

    async def execute(self, request: BashRequest, metadata: t.Dict) -> BashResponse:
        """Execute a bash command."""
        session = self._sessions.get(request.session_id)

        if request.restart or session is None:
            if session:
                session.stop()
            session = BashSession()
            await session.start()
            session_id = f"bash_{len(self._sessions)}"
            self._sessions[session_id] = session
        else:
            session_id = request.session_id

        try:
            output = await session.run(request.command)
            return BashResponse(
                stdout=output[STDOUT],
                stderr=output[STDERR],
                exit_code=output[EXIT_CODE],
                session_id=session_id,
            )
        except ExecutionFailed as e:
            return BashResponse(
                stdout="",
                stderr=str(e),
                exit_code=1,
                session_id=session_id,
            )

