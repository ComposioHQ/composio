"""Tool for executing shell commands."""

import typing as t

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.env.constants import STDERR, STDOUT
from composio.tools.local.shelltool.shell_exec.actions.exec import ShellRequest


class TestExecRequest(ShellRequest):
    """Test execution request."""


class TestExecResponse(BaseModel):
    """Shell execution response."""

    test_response: str = Field(
        ...,
        description="Response from the test command",
    )
    current_shell_pwd: str = Field(
        default="",
        description="Current shell's working directory",
    )


class TestCommand(LocalAction[TestExecRequest, TestExecResponse]):
    """
    Run the command for testing the patch.
    """

    _tags = ["workspace", "shell"]

    def execute(self, request: TestExecRequest, metadata: t.Dict) -> TestExecResponse:
        """Execute a shell command."""
        shell = self.shells.get(id=request.shell_id)
        project_path = metadata.get("project_path")
        command = metadata.get("test_command")
        self.logger.debug(f"Executing {command} @ {shell}")
        shell.exec(cmd=f"cd {project_path}")
        shell.exec(cmd="python -m pip install -e .")
        output = shell.exec(cmd=f"{command}")
        self.logger.debug(output)
        return TestExecResponse(
            test_response=output[STDERR],
            current_shell_pwd=f"Currently in {shell.exec(cmd='pwd')[STDOUT].strip()}",
        )
