import typing as t

from pydantic import Field

from composio.tools.env.filemanager.file import ScrollDirection
from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class ScrollRequest(BaseFileRequest):
    """Request to scroll up/down in the editor."""

    direction: str = Field(
        default="down",
        description="The direction to scroll: up/down, by default it's down",
        title="ScrollDirection",
    )


class ScrollResponse(BaseFileResponse):
    """Response to scroll up/down in the editor."""

    lines: t.Dict[int, str] = Field(
        default={},
        description="File content with their line numbers",
    )
    total_lines: int = Field(
        default=0,
        description="Total number of lines in the file",
    )
    error: str = Field(
        default="",
        description="Error message if any",
    )


class Scroll(BaseFileAction):
    """
    Scrolls the view of the opened file up or down by 100 lines.
    Returns:
    - A dictionary of line numbers and their content for the new view window.
    - An error message if no file is open or if the file is not found.

    Raises:
    - FileNotFoundError: If the file is not found.
    """

    _display_name = "Scroll up/down"
    _request_schema = ScrollRequest
    _response_schema = ScrollResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: ScrollRequest  # type: ignore
    ) -> ScrollResponse:
        try:
            recent_file = file_manager.recent
            if recent_file is None:
                return ScrollResponse(error="No file opened")
            recent_file.scroll(direction=ScrollDirection(request_data.direction))
            return ScrollResponse(
                lines=recent_file.read(),
                total_lines=recent_file.total_lines(),
            )
        except FileNotFoundError as e:
            return ScrollResponse(error=f"File not found: {str(e)}")
