"""Tool for executing shell commands."""

import typing as t

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT


class ShellRequest(BaseModel):
    """Shell request abstraction."""

    shell_id: str = Field(
        default="",
        description=(
            "ID of the shell where this command will be executed, if not "
            "provided the recent shell will be used to execute the action"
        ),
    )


class TestExecRequest(ShellRequest):
    """Test execution request."""


class TestExecResponse(BaseModel):
    """Shell execution response."""

    stdout: str = Field(
        ...,
        description="Output captured from the execution of the command",
    )
    stderr: str = Field(
        ...,
        description="Errors captured during execution of the command",
    )
    current_shell_pwd: str = Field(
        default="",
        description="Current shell's working directory",
    )


class TestCommand(LocalAction[TestExecRequest, TestExecResponse]):
    """
    Run the command for testing the patch.
    Note: THE COMMAND TO TEST THE PATCH IS ALREADY PROVIDED, 
    YOU DON'T NEED TO PROVIDE THE COMMAND IN THE REQUEST.
    """

    _tags = ["workspace", "shell"]

    def execute(self, request: TestExecRequest, metadata: t.Dict) -> TestExecResponse:
        """Execute a shell command."""
        shell = self.shells.get(id=request.shell_id)
        project_path = metadata.get("project_path")
        command = metadata.get("test_command")
        self.logger.debug(f"Executing {command} @ {shell}")
        cwd = shell.exec(cmd=f'cd {project_path}')
        # install = shell.exec(cmd=f'python -m pip install -e .')
        output = shell.exec(cmd=f"{command}")
        self.logger.debug(output)
        return TestExecResponse(
            stdout="\n".join(output[STDOUT].splitlines()[-100:]),
            stderr="\n".join(output[STDERR].splitlines()[-100:]),
            current_shell_pwd=f"Currently in {shell.exec(cmd='pwd')[STDOUT].strip()}",
        )
