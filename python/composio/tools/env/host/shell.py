"""Host shell session wrapper."""

import os
import select
import subprocess
import time
import typing as t

from composio.tools.env.base import Shell
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
        self.logger.debug(f"Initial data from session: {self.id} - {self._read()}")

    def _read(self, timeout: float = 10.0) -> t.Dict:
        """Read data from a subprocess with a timeout."""
        stderr = t.cast(t.IO[str], self._process.stderr).fileno()
        stdout = t.cast(t.IO[str], self._process.stdout).fileno()
        buffer = {stderr: b"", stdout: b""}

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

    def exec(self, cmd: str) -> t.Dict:
        """Execute command on container."""
        try:
            stdin = t.cast(t.IO[str], self._process.stdin)
            os.write(stdin.fileno(), self.sanitize_command(cmd=cmd))
            stdin.flush()
        except BrokenPipeError as e:
            # TODO: Handle this as framework error
            raise RuntimeError(str(e)) from e

        return self._read()

    def stop(self) -> None:
        """Stop and remove the running shell."""
        self._process.kill()
