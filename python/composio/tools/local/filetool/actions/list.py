import typing as t

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


class ListRequest(BaseFileRequest):
    """Request to list files/directories in the workspace."""


class ListResponse(BaseFileResponse):
    """Response to list files/directories in the workspace."""

    files: t.List[t.Tuple[str, str]] = Field(
        default=[], description="List of files and directories in the workspace"
    )
    error: str = Field(default="", description="Error message if any")


class ListFiles(LocalAction[ListRequest, ListResponse]):
    """
    Lists files and directories in the current working directory opened in the
    file manager, it can result in:
    - PermissionError: If the user doesn't have permission to read the directory.
    - FileNotFoundError: If the directory does not exist.
    - OSError: If there's an issue reading the directory.
    """

    @include_cwd  # type: ignore
    def execute(self, request: ListRequest, metadata: t.Dict) -> ListResponse:
        try:
            return ListResponse(
                files=self.filemanagers.get(request.file_manager_id).ls()
            )
        except PermissionError as e:
            return ListResponse(error=f"Permission denied: {str(e)}")
        except FileNotFoundError as e:
            return ListResponse(error=f"Directory not found: {str(e)}")
        except OSError as e:
            return ListResponse(error=f"OS error occurred: {str(e)}")
