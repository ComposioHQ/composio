from pydantic import BaseModel, Field
import typing as t

from composio.tools.local.base.action import Action
from composio.tools.env.base import Workspace


class OpenFileRequest(BaseModel):
    """Request to open a file."""

    file_path: str = Field(..., description="file path to open in the editor")
    line_number: int = Field(
        default=0,
        description="If file-number is given, file will be opened from that line number",
    )


class OpenFileResponse(BaseModel):
    """Response to open a file."""

    lines: t.Dict[int, str] = Field(
        default={}, description="File content with their line numbers"
    )
    error: str = Field(default="", description="Error message if any")


class OpenFile(Action):
    """
    Opens a file in the editor based on the provided file path,
    If line_number is provided, the window will be move to include that line

    Can result in:
    - ValueError: If file_path is not a string or if the file does not exist.
    - FileNotFoundError: If the file does not exist.
    - IOError: If there's an issue reading the file.
    - PermissionError: If the user doesn't have permission to read the file.
    - IsADirectoryError: If the provided path is a directory.
    """

    _display_name = "Open File on workspace"
    _tool_name = "filemanagertool"
    _request_schema = OpenFileRequest
    _response_schema = OpenFileResponse

    def execute(
        self, request_data: OpenFileRequest, authorisation_data: dict
    ) -> OpenFileResponse:
        workspace = t.cast(Workspace, authorisation_data["workspace"])
        try:
            file = workspace.file_manager.open(request_data.file_path)
            if request_data.line_number > 0:
                file.goto(request_data.line_number)
            return OpenFileResponse(lines=file.read())
        except FileNotFoundError as e:
            return OpenFileResponse(error=f"File not found: {str(e)}")
        except IsADirectoryError as e:
            return OpenFileResponse(error=f"Cannot open a directory: {str(e)}")
        except PermissionError as e:
            return OpenFileResponse(error=f"Permission denied: {str(e)}")
        except IOError as e:
            return OpenFileResponse(error=f"Error reading file: {str(e)}")
