from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class ChwdirRequest(BaseFileRequest):
    """Request to change the current working directory."""

    path: str = Field(
        ..., description="The path to change the current working directory to"
    )


class ChwdirResponse(BaseFileResponse):
    """Response to change the current working directory."""


class ChangeWorkingDirectory(BaseFileAction):
    """
    Changes the current working directory of the file manager to the specified path.
    The commands after this action will be executed in this new directory.
    Can result in:
    - PermissionError: If the user doesn't have permission to access the directory.
    - FileNotFoundError: If the directory or any parent directory does not exist.
    - RuntimeError: If the path cannot be resolved due to a loop or other issues.
    """

    _display_name = "Change Working Directory"
    _request_schema = ChwdirRequest
    _response_schema = ChwdirResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: ChwdirRequest  # type: ignore
    ) -> ChwdirResponse:
        try:
            file_manager.chdir(request_data.path)
            return ChwdirResponse()
        except PermissionError as e:
            return ChwdirResponse(error=f"Permission denied: {str(e)}")
        except FileNotFoundError as e:
            return ChwdirResponse(error=f"Directory not found: {str(e)}")
        except RuntimeError as e:
            return ChwdirResponse(error=f"Unable to resolve path: {str(e)}")
