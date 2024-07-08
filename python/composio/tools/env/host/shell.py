"""Host shell session wrapper."""

import os
import select
import subprocess
import time
import typing as t

from composio.tools.env.base import Shell
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

    def _wait_for_cmd(self, cmd: str) -> None:
        """Waif for command to exit."""
        while True:
            output = subprocess.run(  # pylint: disable=subprocess-run-check
                ["ps", "-e"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            ).stdout.decode()
            if all(_cmd.lstrip().rstrip() not in output for _cmd in cmd.split("&&")):
                return
            time.sleep(1)

    def _get_exit_code(self) -> int:
        """Get exit code of the last process."""
        self._write("echo $#")
        return int(self._read(wait=False).get("stdout").strip())  # type: ignore

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

        if wait:
            self._wait_for_cmd(cmd=str(cmd))

        end_time = time.time() + timeout
        while time.time() < end_time:
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
            "stdout": buffer[stdout].decode(),
            "stderr": buffer[stderr].decode(),
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
            "exit_code": self._get_exit_code(),
        }

    def stop(self) -> None:
        """Stop and remove the running shell."""
        self._process.kill()
