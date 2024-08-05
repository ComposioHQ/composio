"""Tool for creating a new shell session."""

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class ShellCreateRequest(BaseModel):
    """Execute command request."""


class ShellCreateResponse(BaseModel):
    """Shell execution response."""

    shell_id: str = Field(
        ...,
        description="Output captured from the execution of the command",
    )


class CreateShell(LocalAction[ShellCreateRequest, ShellCreateResponse]):
    """Use this tool to create a new shell session."""

    _tags = ["workspace", "shell", "create"]

    def execute(
        self,
        request: ShellCreateRequest,
        metadata: dict,
    ) -> ShellCreateResponse:
        """Execute a shell command."""
        return ShellCreateResponse(shell_id=self.shells.new().id)
