"""Spawn a process."""

import shutil
import subprocess
import tempfile
from pathlib import Path

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


# pylint: disable=consider-using-with,unspecified-encoding


class SpawnRequest(BaseModel):
    """Execute command request."""

    cmd: str = Field(
        ...,
        description="Command to be executed.",
        examples=[
            "/bin/python /home/user/server.py",
            "node /home/user/server.js",
            "yarn start",
        ],
    )
    working_dir: str = Field(
        None,
        description=(
            "Directory where this command should be executed, "
            "if not provided the current directory will be used"
        ),
        examples=[
            "/home/user",
            "./",
        ],
    )


class SpawnResponse(BaseModel):
    """Shell execution response."""

    stdout: str = Field(
        ...,
        description="Path to the file containing the stdout stream",
    )
    stderr: str = Field(
        ...,
        description="Path to the file containing the stderr stream.",
    )
    pid: str = Field(
        ...,
        description="Path to the file containing the process ID for the spawned process",
    )


class SpawnProcess(Action):
    """
    Spawn a process.

    Use this action to launch processes on background, for example launch a
    python process using

    cmd: python path/to/script.py
    """

    _display_name = "Spawn Process"
    _tool_name = "shell"
    _request_schema = SpawnRequest
    _response_schema = SpawnResponse
    _tags = ["workspace", "shell"]

    def execute(
        self,
        request_data: SpawnRequest,
        authorisation_data: dict,
    ) -> SpawnResponse:
        """Execute a shell command."""
        cmd, *args = request_data.cmd.split(" ")
        cmd = shutil.which(cmd=cmd)  # type: ignore
        if cmd is None:
            raise ValueError(f"Command `{cmd}` not found!")

        tempdir = tempfile.TemporaryDirectory()
        stdout = Path(tempdir.name, "stdout.txt")
        stderr = Path(tempdir.name, "stderr.txt")
        process = subprocess.Popen(
            args=[cmd, *args],
            start_new_session=True,
            stdout=stdout.open("w+"),
            stderr=stderr.open("w+"),
            cwd=str(request_data.working_dir or Path.cwd()),
        )
        pid = Path(tempdir.name, "pid.txt")
        pid.write_text(str(process.pid))
        return SpawnResponse(stdout=str(stdout), stderr=str(stderr), pid=str(pid))
