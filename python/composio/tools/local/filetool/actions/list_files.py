import typing as t

from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class ListRequest(BaseFileRequest):
    """Request to list files/directories in the workspace."""


class ListResponse(BaseFileResponse):
    """Response to list files/directories in the workspace."""

    files: t.List[t.Tuple[str, str]] = Field(
        default=[], description="List of files and directories in the workspace"
    )
    error: str = Field(default="", description="Error message if any")


class ListFiles(BaseFileAction):
    """
    Lists files and directories in the current working directory opened in the file manager.
    Can result in:
    - PermissionError: If the user doesn't have permission to read the directory.
    - FileNotFoundError: If the directory does not exist.
    - OSError: If there's an issue reading the directory.
    """

    _display_name = "List Files in Workspace"
    _request_schema = ListRequest
    _response_schema = ListResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: ListRequest  # type: ignore
    ) -> ListResponse:
        try:
            files = file_manager.ls()
            return ListResponse(files=files)
        except PermissionError as e:
            return ListResponse(error=f"Permission denied: {str(e)}")
        except FileNotFoundError as e:
            return ListResponse(error=f"Directory not found: {str(e)}")
        except OSError as e:
            return ListResponse(error=f"OS error occurred: {str(e)}")
