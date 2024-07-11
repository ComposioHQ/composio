"""Host shell session wrapper."""

import os
import select
import subprocess
import time
import typing as t

from composio.tools.env.base import Shell
from composio.tools.env.constants import ECHO_EXIT_CODE, EXIT_CODE, STDERR, STDOUT
from composio.tools.env.docker.scripts import (
    SHELL_ENV_VARS,
    SHELL_SOURCE_FILES,
    SHELL_STATE_CMD,
)
from composio.tools.env.id import generate_id


# TODO: Execute in a virtual environment
class HostShell(Shell):
    """Host interactive shell."""

    _process: subprocess.Popen

    def __init__(self) -> None:
        """Initialize shell."""
        super().__init__()
        self._id = generate_id()
        self._process = subprocess.Popen(  # pylint: disable=consider-using-with
            args=["/bin/bash", "-l", "-m"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self.logger.debug(
            f"Initial data from session: {self.id} - {self._read(wait=False)}"
        )

    def _has_command_exited(self, cmd: str) -> bool:
        """Waif for command to exit."""
        output = subprocess.run(  # pylint: disable=subprocess-run-check
            ["ps", "-e"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        ).stdout.decode()
        return all(_cmd.lstrip().rstrip() not in output for _cmd in cmd.split("&&"))

    def _get_exit_code(self) -> int:
        """Get exit code of the last process."""
        self._write(ECHO_EXIT_CODE)
        *_, exit_code = self._read(wait=False).get(STDOUT).strip().split("\n")  # type: ignore
        if len(exit_code) == 0:
            # `edit` command sometimes does not work as expected
            return 0
        return int(exit_code)

    def _read(
        self,
        cmd: t.Optional[str] = None,
        wait: bool = True,
        timeout: float = 120.0,
    ) -> t.Dict:
        """Read data from a subprocess with a timeout."""
        stderr = t.cast(t.IO[str], self._process.stderr).fileno()
        stdout = t.cast(t.IO[str], self._process.stdout).fileno()
        buffer = {stderr: b"", stdout: b""}
        if wait and cmd is None:
            raise ValueError("`cmd` cannot be `None` when `wait` is set to `True`")

        end_time = time.time() + timeout
        while time.time() < end_time:
            if wait and not self._has_command_exited(cmd=str(cmd)):
                time.sleep(0.5)
                continue

            readables, _, _ = select.select([stderr, stdout], [], [], 0.1)
            if not readables:
                break
            for fd in readables:
                data = os.read(fd, 4096)
                if data:
                    buffer[fd] += data
            time.sleep(0.05)

        if self._process.poll() is not None:
            raise RuntimeError(
                f"Subprocess exited unexpectedly.\nCurrent buffer: {buffer}"
            )
        if time.time() >= end_time:
            raise TimeoutError(
                "Timeout reached while reading from subprocess.\nCurrent "
                f"buffer: {buffer}"
            )
        return {
            STDOUT: buffer[stdout].decode(),
            STDERR: buffer[stderr].decode(),
        }

    def setup(self) -> None:
        """Setup host shell."""
        self.logger.debug(f"Setting up shell: {self.id}")
        for var, val in SHELL_ENV_VARS.items():
            self.exec(cmd=f"{var}={val}")
            time.sleep(0.05)
        self.exec(cmd=SHELL_STATE_CMD)
        time.sleep(0.05)
        for file in SHELL_SOURCE_FILES:
            self.exec(cmd=f"source {file}")
            time.sleep(0.05)

    def _write(self, cmd: str) -> None:
        """Write command to shell."""
        try:
            stdin = t.cast(t.IO[str], self._process.stdin)
            os.write(stdin.fileno(), self.sanitize_command(cmd=cmd))
            stdin.flush()
        except BrokenPipeError as e:
            # TODO: Handle this as framework error
            raise RuntimeError(str(e)) from e

    def exec(self, cmd: str) -> t.Dict:
        """Execute command on container."""
        self._write(cmd=cmd)
        return {
            **self._read(cmd=cmd, wait=True),
            EXIT_CODE: self._get_exit_code(),
        }

    def stop(self) -> None:
        """Stop and remove the running shell."""
        self._process.kill()
