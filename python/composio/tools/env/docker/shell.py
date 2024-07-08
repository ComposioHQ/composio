"""Docker shell session wrapper."""

import os
import select
import subprocess
import tarfile
import tempfile
import time
import traceback
import typing as t
from io import BytesIO

from docker.models.containers import Container

from composio.tools.env.base import Shell
from composio.tools.env.docker.scripts import get_shell_env
from composio.tools.env.id import generate_id


class DockerShell(Shell):
    """Docker interactive shell."""

    _image: str
    _container: Container
    _process: subprocess.Popen

    def __init__(self, container: Container) -> None:
        """Initialize shell."""
        super().__init__()
        self._id = generate_id()
        self._container = container
        self._wait_for_entrypoint()
        self._process = subprocess.Popen(  # pylint: disable=consider-using-with
            args=["docker", "exec", "-i", str(container.name), "/bin/bash", "-l", "-m"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        time.sleep(5)
        bash_pids, other_pids = self._get_background_pids()
        if len(other_pids) > 0:
            raise RuntimeError(
                "Detected alien processes attached or running. "
                "Please ensure that no other agents are running on "
                f"this container. PIDs: {bash_pids}, {other_pids}"
            )

        bash_pid = 1
        if len(bash_pids) == 1:
            bash_pid = bash_pids[0][0]
        self._bash_pids = set(map(str, (1, bash_pid)))

        self.logger.debug(f"Initial data from session: {self.id} - {self._read()}")

    def _wait_for_entrypoint(self, timeout: float = 120.0) -> None:
        """Wait for the entrypoint script to complete."""
        end_time = time.time() + timeout
        while time.time() < end_time:
            exit_code, output = self._container.exec_run(
                "test -f /tmp/entrypoint_complete"
            )
            if exit_code == 0:
                return
            time.sleep(1)
        raise TimeoutError(
            "Timeout reached while waiting for the entrypoint script to complete."
        )

    def _get_background_pids(self) -> t.Tuple[t.List, t.List]:
        """Gets list of processes running inside docker container"""
        pids = (
            self._container.exec_run("ps -eo pid,comm --no-headers")
            .output.decode()
            .split("\n")
        )
        pids = [pid.split() for pid in pids if pid]
        pids = [pid for pid in pids if pid[1] not in {"ps"} and pid[0] != "1"]
        bash_pids = [pid for pid in pids if pid[1] == "bash"]
        other_pids = [pid for pid in pids if pid[1] not in {"bash"}]
        return bash_pids, other_pids

    def _get_current_pids(self) -> t.List[str]:
        """Gets list of processes running inside docker container"""
        pids = (
            self._container.exec_run("ps -eo pid,comm --no-headers")
            .output.decode()
            .split("\n")
        )
        return [
            pid[0]
            for pid in [pid.split() for pid in pids if pid]
            if pid[1] not in ("ps", "bash") and pid[0] not in self._bash_pids
        ]

    def _read(self, timeout: float = 120.0) -> t.Dict:
        """Read data from a subprocess with a timeout."""
        stderr = t.cast(t.IO[str], self._process.stderr).fileno()
        stdout = t.cast(t.IO[str], self._process.stdout).fileno()
        buffer = {stderr: b"", stdout: b""}

        end_time = time.time() + timeout
        while time.time() < end_time:
            pids = self._get_current_pids()
            if len(pids) > 0:
                time.sleep(0.05)
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
                f"buffer: {buffer}\nRunning PIDs: {pids}"
            )
        return {
            "stdout": buffer[stdout].decode(),
            "stderr": buffer[stderr].decode(),
        }

    def _copy(self, contents, destination: str) -> None:
        """
        Copies a given string into a Docker container at a specified path.
        """
        temp_file_name = None
        try:
            # Create a temporary file
            with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                temp_file_name = temp_file.name
                # Write the string to the temporary file and ensure it's written to disk
                temp_file.write(contents.encode("utf-8"))
                temp_file.flush()
                os.fsync(temp_file.fileno())

            # Create a TAR archive in memory containing the temporary file
            with tempfile.NamedTemporaryFile(), open(temp_file_name, "rb") as temp_file:
                # Prepare the TAR archive
                with BytesIO() as tar_stream:
                    with tarfile.open(fileobj=tar_stream, mode="w") as tar:
                        tar_info = tarfile.TarInfo(name=os.path.basename(destination))
                        tar_info.size = os.path.getsize(temp_file_name)
                        tar.addfile(tarinfo=tar_info, fileobj=temp_file)
                    tar_stream.seek(0)

                    # Copy the TAR stream to the container
                    self._container.put_archive(
                        path=os.path.dirname(destination),
                        data=tar_stream.read(),
                    )

        except Exception as e:
            self.logger.error("An error occurred: %s", e)
            self.logger.error(traceback.format_exc())
        finally:
            # Cleanup: Remove the temporary file if it was created
            if temp_file_name and os.path.exists(temp_file_name):
                os.remove(temp_file_name)

    def _communicate_with_handling(self, cmd: str, error: str) -> str:
        """Communicate with docker process."""
        output = self.exec(cmd)
        if len(output["stderr"]) != 0:
            raise RuntimeError(f"{cmd}: {error}: {output}")
        return output["stdout"]

    def setup(self) -> None:
        """Setup shell."""

        env = get_shell_env()
        commands = "\n".join(env.commands_to_execute)
        output, return_code = None, 0
        try:
            response = self.exec(commands)
            output, return_code = response["stdout"], 0
        except KeyboardInterrupt as e:
            if return_code != 0:
                raise RuntimeError(
                    f"Nonzero return code: {return_code}\nOutput: {output}"
                ) from e
            raise
        except Exception as e:
            raise RuntimeError("Failed to set environment variables") from e

        self.exec("mkdir -p /root/commands")
        for cmd_file in env.copy_file_to_workspace:
            self._copy(
                contents=cmd_file.datum,
                destination=f"/root/commands/{cmd_file.name}",
            )
            if cmd_file.cmd_type == "source_file":
                self._communicate_with_handling(
                    cmd=f"source /root/commands/{cmd_file.name}",
                    error=(
                        f"Failed to source {cmd_file.name}. If you meant to make a script "
                        f"start the file with a shebang (e.g. #!/usr/bin/env python)."
                    ),
                )
            elif cmd_file.cmd_type == "script":
                self._communicate_with_handling(
                    cmd=f"chmod +x /root/commands/{cmd_file.name}",
                    error=f"Failed to chmod {cmd_file.name}",
                )
            else:
                raise ValueError(f"Invalid command type: {cmd_file.cmd_type}")

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
