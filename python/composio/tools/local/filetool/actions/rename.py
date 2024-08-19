import typing as t

from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
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


class RenameFile(BaseFileAction):
    """
    Renames a file based on the provided file path,

    Can result in:
    - ValueError: If old_file_path / new_file_path is not a string or if the file/directory does not exist.
    - FileExistsError: If the new_file_path file/directory path already exists.
    - FileNotFoundError: If the old_file_path file/directory does not exist.
    - PermissionError: If the user doesn't have permission to rename the file/directory.
    """

    _display_name = "Rename a file"
    _request_schema = RenameFileRequest
    _response_schema = RenameFileResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: RenameFileRequest  # type: ignore
    ) -> RenameFileResponse:
        try:
            is_success = file_manager.rename(
                request_data.old_file_path, request_data.new_file_path
            )
            if not is_success:
                return RenameFileResponse(error="Failed to rename the file.")
            return RenameFileResponse(
                message="File renamed successfully.",
            )
        except FileNotFoundError as e:
            return RenameFileResponse(error=f"File not found: {str(e)}")
        except PermissionError as e:
            return RenameFileResponse(error=f"Permission denied: {str(e)}")
        except IOError as e:
            return RenameFileResponse(error=f"Error reading file: {str(e)}")

