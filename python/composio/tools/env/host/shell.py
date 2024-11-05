"""Host shell session wrapper."""

import os
import re
import select
import subprocess
import time
import typing as t
from abc import abstractmethod
from pathlib import Path

import paramiko

from composio.tools.env.base import Sessionable
from composio.tools.env.constants import ECHO_EXIT_CODE, EXIT_CODE, STDERR, STDOUT
from composio.tools.env.id import generate_id


_ANSI_ESCAPE = re.compile(
    rb"""
    \x1B
    (?:
        [@-Z\\-_]
    |
        \[
        [0-?]*
        [ -/]*
        [@-~]
    )
""",
    re.VERBOSE,
)


_DEV_SOURCE = Path("/home/user/.dev/bin/activate")
_NOWAIT_CMDS = ("cd", "ls", "pwd")


class Shell(Sessionable):
    """Abstract shell session."""

    def sanitize_command(self, cmd: str) -> bytes:
        """Prepare command string."""
        return (cmd.rstrip() + "\n").encode()

    @abstractmethod
    def exec(self, cmd: str, wait: bool = True) -> t.Dict:
        """Execute command on container."""


# TODO: Execute in a virtual environment
class HostShell(Shell):
    """Host interactive shell."""

    _process: subprocess.Popen

    def __init__(self, environment: t.Optional[t.Dict] = None) -> None:
        """Initialize shell."""
        super().__init__()
        self._id = generate_id()
        self.environment = environment or {}

    def setup(self) -> None:
        """Setup host shell."""
        self.logger.debug(f"Setting up shell: {self.id}")
        self._process = subprocess.Popen(  # pylint: disable=consider-using-with
            args=["/bin/bash", "-l", "-m"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=self.environment,
        )
        self.logger.debug(
            "Initial data from session: %s - %s",
            self.id,
            self._read(wait=False),
        )

        # Load development environment if available
        if _DEV_SOURCE.exists():
            self.logger.debug("Loading development environment")
            self.exec(f"source {_DEV_SOURCE}")

        # Setup environment
        for key, value in self.environment.items():
            self.exec(f"export {key}={value}")
            time.sleep(0.05)

    def _has_command_exited(self, cmd: str) -> bool:
        """Waif for command to exit."""
        _cmd, *_ = cmd.split(" ")
        if _cmd in _NOWAIT_CMDS:
            time.sleep(0.3)
            return True

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

    def _write(self, cmd: str) -> None:
        """Write command to shell."""
        try:
            stdin = t.cast(t.IO[str], self._process.stdin)
            os.write(stdin.fileno(), self.sanitize_command(cmd=cmd))
            stdin.flush()
        except BrokenPipeError as e:
            raise RuntimeError(str(e)) from e

    def exec(self, cmd: str, wait: bool = True) -> t.Dict:  # type: ignore
        """Execute command on container."""
        self._write(cmd=cmd)
        return {
            **self._read(cmd=cmd, wait=wait),
            EXIT_CODE: self._get_exit_code(),
        }

    def teardown(self) -> None:
        """Stop and remove the running shell."""
        self._process.kill()


class SSHShell(Shell):
    """Interactive shell over SSH session."""

    def __init__(
        self, client: paramiko.SSHClient, environment: t.Optional[t.Dict] = None
    ) -> None:
        """Initialize interactive shell."""
        super().__init__()
        self._id = generate_id()
        self.client = client
        self.environment = environment or {}
        self.channel = self.client.invoke_shell(environment=self.environment)

    def setup(self) -> None:
        """Invoke shell."""
        self.logger.debug(f"Setting up shell: {self.id}")

        # Load development environment if available
        if _DEV_SOURCE.exists():
            self.logger.debug("Loading development environment")
            self.exec(f"source {_DEV_SOURCE}")

        # Setup environment
        for key, value in self.environment.items():
            self._send(f"export {key}={value}")
            time.sleep(0.05)
            self._read()

        # CD to user dir
        self.exec(cmd="cd ~/ && export PS1=''")

    def _send(self, buffer: str, stdin: t.Optional[str] = None) -> None:
        """Send buffer to shell."""
        if stdin is None:
            self.channel.sendall(f"{buffer}\n".encode("utf-8"))
            time.sleep(0.05)
            return

        self.channel.send(f"{buffer}\n".encode("utf-8"))
        self.channel.sendall(f"{stdin}\n".encode("utf-8"))
        time.sleep(0.05)

    def _read(self) -> str:
        """Read buffer from shell."""
        output = b""
        while self.channel.recv_ready():
            output += self.channel.recv(512)
        while self.channel.recv_stderr_ready():
            output += self.channel.recv_stderr(512)
        return _ANSI_ESCAPE.sub(b"", output).decode(encoding="utf-8")

    def _wait(self, cmd: str) -> None:
        """Wait for the command to execute."""
        _cmd, *_rest = cmd.split(" ")
        if _cmd in _NOWAIT_CMDS or len(_rest) == 0:
            time.sleep(0.3)
            return

        while True:
            _, stdout, _ = self.client.exec_command(command="ps -eo command")
            if all(
                not line.lstrip().rstrip().endswith(cmd)
                for line in stdout.read().decode().split("\n")
            ):
                return
            time.sleep(0.3)

    def _exit_status(self) -> int:
        """Wait for the command to execute."""
        self._send(buffer="echo $?")
        try:
            output = self._read().split("\n")
            if len(output) == 1:
                return int(output[0].lstrip().rstrip())
            return int(output[1].lstrip().rstrip())
        except ValueError:
            return 1

    def _sanitize_output(self, output: str) -> str:
        """Clean the output."""
        lines = list(map(lambda x: x.rstrip(), output.split("\r\n")))
        clean = "\n".join(lines[1:])
        if clean.startswith("\r"):
            clean = clean[1:]
        return clean.replace("(.dev)\n", "")

    def exec(self, cmd: str, wait: bool = True) -> t.Dict:
        """Execute a command and return output and exit code."""
        output = ""
        for _cmd in cmd.split(" && "):
            self._send(buffer=_cmd)
            if wait:
                self._wait(cmd=_cmd)
            output += self._sanitize_output(output=self._read())

        return {
            STDOUT: output,
            STDERR: "",
            EXIT_CODE: str(self._exit_status()),
        }

    def teardown(self) -> None:
        """Close the SSH channel."""
        self.channel.close()
