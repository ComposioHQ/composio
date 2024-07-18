from composio.tools.env.filemanager.file import ScrollDirection
from composio.tools.env.filemanager.manager import FileManager

from pydantic import Field
import typing as t

from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class ScrollRequest(BaseFileRequest):
    """Request to scroll up/down in the editor."""
    direction: ScrollDirection = Field(default=ScrollDirection.DOWN, description="The direction to scroll, by default it's down")


class ScrollResponse(BaseFileResponse):
    """Response to scroll up/down in the editor."""

    lines: t.Dict[int, str] = Field(
        default={}, description="File content with their line numbers"
    )
    error: str = Field(default="", description="Error message if any")


class Scroll(BaseFileAction):
    """
    Scrolls the view of the opened file up or down by 100 lines.
    """

    _display_name = "Scroll up/down"
    _request_schema = ScrollRequest
    _response_schema = ScrollResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: ScrollRequest
    ) -> ScrollResponse:
        try:
            recent_file = file_manager._recent
            if recent_file is None:
                return ScrollResponse(error="No file opened")
            recent_file.scroll(direction=request_data.direction)
            lines = recent_file.read()
            return ScrollResponse(lines=lines)
        except FileNotFoundError as e:
            return ScrollResponse(error=f"File not found: {str(e)}")
