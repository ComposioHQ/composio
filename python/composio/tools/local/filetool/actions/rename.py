from typing import Dict

from pydantic import Field

from composio.tools.base.exceptions import ExecutionFailed
from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
)


class RenameFileRequest(BaseFileRequest):
    """Request to rename a file."""

    old_file_path: str = Field(
        ...,
        description="Old file path to rename. This is a relative path to the current directory",
    )
    new_file_path: str = Field(
        ...,
        description="New file path to rename. This is a relative path to the current directory",
    )


class RenameFileResponse(BaseFileResponse):
    """Response to rename a file."""

    message: str = Field(default="", description="Message to display to the user")
    error: str = Field(default="", description="Error message if any")


class RenameFile(LocalAction[RenameFileRequest, RenameFileResponse]):
    """
    Renames a file based on the provided file path,

    Can result in:
    - ValueError: If old_file_path / new_file_path is not a string or if the file/directory does not exist.
    - FileExistsError: If the new_file_path file/directory path already exists.
    - FileNotFoundError: If the old_file_path file/directory does not exist.
    - PermissionError: If the user doesn't have permission to rename the file/directory.
    """

    display_name = "Rename a file"

    def execute(self, request: RenameFileRequest, metadata: Dict) -> RenameFileResponse:
        is_success = self.filemanagers.get(
            request.file_manager_id,
        ).rename(
            request.old_file_path,
            request.new_file_path,
        )
        if not is_success:
            raise ExecutionFailed("Failed to rename the file.")
        return RenameFileResponse(
            message="File renamed successfully.",
        )
