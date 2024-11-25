import typing as t

from pydantic import Field

from composio.tools.base.exceptions import ExecutionFailed
from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


class OpenFileRequest(BaseFileRequest):
    """Request to open a file."""

    file_path: str = Field(
        ...,
        description="file path to open in the editor. This is a relative path to the current directory",
    )
    line_number: int = Field(
        default=0,
        description="If file-number is given, file will be opened from that line number",
    )


class OpenFileResponse(BaseFileResponse):
    """Response to open a file."""

    message: str = Field(default="", description="Message to display to the user")
    lines: str = Field(default="", description="File content with their line numbers")


class OpenFile(LocalAction[OpenFileRequest, OpenFileResponse]):
    """
    Opens a file in the editor based on the provided file path,
    If line_number is provided, the window will be moved after that line. (i.e. 100 lines after the line number will be displayed)

    Can result in:
    - ValueError: If file_path is not a string or if the file does not exist.
    - FileNotFoundError: If the file does not exist.
    - IOError: If there's an issue reading the file.
    - PermissionError: If the user doesn't have permission to read the file.
    - IsADirectoryError: If the provided path is a directory.
    """

    @include_cwd  # type: ignore
    def execute(self, request: OpenFileRequest, metadata: t.Dict) -> OpenFileResponse:
        """Open a file."""
        try:
            file = self.filemanagers.get(request.file_manager_id).open(
                request.file_path
            )
            if request.line_number > 0:
                file.goto(request.line_number)

            content = file.format_text(lines=file.read())
            if len(content) == 0:
                raise ExecutionFailed("File is empty")

            return OpenFileResponse(
                message="File opened successfully. 100 lines after the cursor displayed.",
                lines=content,
            )
        except FileNotFoundError as e:
            raise ExecutionFailed(f"File not found: {str(e)}") from e
        except IsADirectoryError as e:
            raise ExecutionFailed(f"Cannot open a directory: {str(e)}") from e
        except PermissionError as e:
            raise ExecutionFailed(f"Permission denied: {str(e)}") from e
        except IOError as e:
            raise ExecutionFailed(f"Error reading file: {str(e)}") from e
