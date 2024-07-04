"""Tool for creating a new shell session."""

import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class ShellCreateRequest(BaseModel):
    """Execute command request."""


class ShellCreateResponse(BaseModel):
    """Shell execution response."""

    shell_id: str = Field(
        ...,
        description="Output captured from the execution of the command",
    )


class CreateShell(Action[ShellCreateRequest, ShellCreateResponse]):
    """Use this tool to create a new shell session."""

    _runs_on_workspace = True
    _display_name = "Create Shell"
    _tool_name = "shell"
    _request_schema = ShellCreateRequest
    _response_schema = ShellCreateResponse
    _tags = ["workspace", "shell", "create"]

    def execute(
        self,
        request_data: ShellCreateRequest,
        authorisation_data: dict,
    ) -> ShellCreateResponse:
        """Execute a shell command."""
        shell = authorisation_data.get("workspace").shells.new()  # type: ignore
        return ShellCreateResponse(shell_id=shell.id)
