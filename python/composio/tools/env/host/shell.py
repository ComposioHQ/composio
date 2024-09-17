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
    def exec(self, cmd: str) -> t.Dict:
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
        self.logger.debug(f"HostShell initialized with ID: {self._id}")

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
        )
        self.logger.debug(f"Subprocess created with PID: {self._process.pid}")
        initial_data = self._read(wait=False)
        self.logger.debug(
            f"Initial data from session: {self.id} - {initial_data}",
        )

        # Load development environment if available
        if _DEV_SOURCE.exists():
            self.logger.debug(f"Loading development environment from {_DEV_SOURCE}")
            self.exec(f"source {_DEV_SOURCE}")
        else:
            self.logger.debug(f"Development environment source not found at {_DEV_SOURCE}")

        # Setup environment
        self.logger.debug("Setting up environment variables")
        for key, value in self.environment.items():
            self.logger.debug(f"Setting environment variable: {key}")
            self.exec(f"export {key}={value}")
            time.sleep(0.05)
        self.logger.debug("Environment setup complete")

    def _has_command_exited(self, cmd: str) -> bool:
        """Wait for command to exit."""
        self.logger.debug(f"Checking if command has exited: {cmd}")
        # Split the command and remove any environment variable assignments
        cmd_parts = [part for part in cmd.split() if '=' not in part]
        if not cmd_parts:
            self.logger.debug("Only environment variables set, considering command exited")
            return True  # If only env vars were set, consider it exited

        _cmd = cmd_parts[0]
        self.logger.debug(f"Checking _cmd: {_cmd}")
        if _cmd in _NOWAIT_CMDS:
            self.logger.debug(f"Command {_cmd} is in NOWAIT_CMDS, waiting 0.5 seconds")
            time.sleep(0.5)
            return True

        self.logger.debug("Running 'ps -e' to check for running processes")
        output = subprocess.run(  # pylint: disable=subprocess-run-check
            ["ps", "-e"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        ).stdout.decode()
        self.logger.debug(f"ps -e output (truncated): {output[:200]}...")
        # Remove any environment variable assignments from cmd
        cmd_parts = [part for part in cmd.split() if '=' not in part]
        cmd_without_env_vars = " ".join(cmd_parts)
        self.logger.debug(f"Command without env vars: {cmd_without_env_vars}")
        return all(_cmd.strip() not in output for _cmd in cmd_without_env_vars.split("&&"))
        # return False

    def _get_exit_code(self) -> int:
        """Get exit code of the last process."""
        self.logger.debug("Getting exit code")
        self._write(ECHO_EXIT_CODE)
        read_result = self._read(wait=False)
        self.logger.debug(f"Read result for exit code: {read_result}")
        stdout = read_result.get(STDOUT, "").strip()
        self.logger.debug(f"STDOUT for exit code: {stdout}")
        *_, exit_code = stdout.split("\n")
        self.logger.debug(f"Raw exit code: {exit_code}")
        if len(exit_code) == 0:
            self.logger.debug("Empty exit code, returning 0")
            return 0
        return int(exit_code)

    def _read(
        self,
        cmd: t.Optional[str] = None,
        wait: bool = True,
        timeout: float = 300.0,
    ) -> t.Dict:
        """Read data from a subprocess with a timeout."""
        self.logger.debug(f"Reading data. Command: {cmd}, Wait: {wait}, Timeout: {timeout}")
        stderr = t.cast(t.IO[str], self._process.stderr).fileno()
        stdout = t.cast(t.IO[str], self._process.stdout).fileno()
        buffer = {stderr: b"", stdout: b""}
        if wait and cmd is None:
            raise ValueError("`cmd` cannot be `None` when `wait` is set to `True`")

        end_time = time.time() + timeout
        while time.time() < end_time:
            if wait and not self._has_command_exited(cmd=str(cmd)):
                self.logger.debug("Command not exited, waiting 0.5 seconds")
                time.sleep(0.5)
                continue

            self.logger.debug("Selecting readable file descriptors")
            readables, _, _ = select.select([stderr, stdout], [], [], 0.1)
            if not readables:
                self.logger.debug("No readable file descriptors, breaking loop")
                break
            for fd in readables:
                data = os.read(fd, 4096)
                if data:
                    buffer[fd] += data
                    self.logger.debug(f"Read {len(data)} bytes from {'stderr' if fd == stderr else 'stdout'}")
            time.sleep(0.05)

        if self._process.poll() is not None:
            self.logger.error(f"Subprocess exited unexpectedly. Exit code: {self._process.returncode}")
            raise RuntimeError(
                f"Subprocess exited unexpectedly.\nCurrent buffer: {buffer}"
            )

        if time.time() >= end_time:
            self.logger.error("Timeout reached while reading from subprocess")
            raise TimeoutError(
                "Timeout reached while reading from subprocess.\nCurrent "
                f"buffer: {buffer}"
            )

        result = {
            STDOUT: buffer[stdout].decode(),
            STDERR: buffer[stderr].decode(),
        }
        self.logger.debug(f"Read result: {result}")
        return result

    def _write(self, cmd: str) -> None:
        """Write command to shell."""
        self.logger.debug(f"Writing command: {cmd}")
        try:
            stdin = t.cast(t.IO[str], self._process.stdin)
            sanitized_cmd = self.sanitize_command(cmd=cmd)
            self.logger.debug(f"Sanitized command: {sanitized_cmd}")
            os.write(stdin.fileno(), sanitized_cmd)
            stdin.flush()
            self.logger.debug("Command written and flushed")
        except BrokenPipeError as e:
            self.logger.error(f"BrokenPipeError occurred: {e}")
            raise RuntimeError(str(e)) from e

    def exec(self, cmd: str) -> t.Dict:
        """Execute command on container."""
        self.logger.debug(f"Executing command: {cmd}")
        self._write(cmd=cmd)
        result = {
            **self._read(cmd=cmd, wait=True),
            EXIT_CODE: self._get_exit_code(),
        }
        self.logger.debug(f"Execution result: {result}")
        return result

    def teardown(self) -> None:
        """Stop and remove the running shell."""
        self.logger.debug("Tearing down HostShell")
        self._process.kill()
        self.logger.debug("Process killed")


class SSHShell(Shell):
    """Interactive shell over SSH session."""

    def __init__(
        self, client: paramiko.SSHClient, environment: t.Optional[t.Dict] = None
    ) -> None:
        """Initialize interactive shell."""
        super().__init__()
        self._id = generate_id()
        self.client = client
        self.channel = self.client.invoke_shell()
        self.environment = environment or {}

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

    def exec(self, cmd: str, stdin: t.Optional[str] = None) -> t.Dict:
        """Execute a command and return output and exit code."""
        output = ""
        for _cmd in cmd.split(" && "):
            self._send(buffer=_cmd, stdin=stdin)
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
