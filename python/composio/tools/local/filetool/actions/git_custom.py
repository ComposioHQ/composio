import typing as t
from pathlib import Path

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


class GitCustomRequest(BaseFileRequest):
    """Request to run a custom git command."""

    cmd: str = Field(
        ...,
        description="The custom git command to run. Avoid using `git` prefix. Example: `add -u`, `commit -m 'test-commit'`",
    )


class GitCustomResponse(BaseFileResponse):
    """Response to running a custom git command."""

    success: bool = Field(
        False, description="Whether the command execution was successful"
    )
    message: str = Field("", description="Status message or error description")


class GitCustom(LocalAction[GitCustomRequest, GitCustomResponse]):
    """
    Run a custom git command from the current directory.

    This action runs a custom git command from the current working directory.

    Usage example:
    1. cmd: "add -u"
    2. cmd: "commit -m 'test-commit'"
    """

    @include_cwd  # type: ignore
    def execute(self, request: GitCustomRequest, metadata: t.Dict) -> GitCustomResponse:
        file_manager = self.filemanagers.get(request.file_manager_id)
        repo_path = Path(file_manager.working_dir)
        if not (repo_path / ".git").is_dir():
            return GitCustomResponse(
                success=False,
                message=f"Error: The directory '{repo_path}' is not the root of a git repository.",
            )

        original_dir = file_manager.working_dir
        file_manager.chdir(repo_path)
        command = f"git {request.cmd}"
        output, error = file_manager.execute_command(command)
        if error:
            return GitCustomResponse(success=False, message=f"Error: {error}")

        # Change back to the original directory
        file_manager.chdir(original_dir)
        return GitCustomResponse(
            success=True,
            message=output if output else "Git command executed successfully.",
        )
