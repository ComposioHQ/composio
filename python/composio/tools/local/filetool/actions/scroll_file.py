from composio.tools.env.base import Workspace
from composio.tools.env.filemanager.file import ScrollDirection
from composio.tools.local.base.action import Action

from pydantic import BaseModel, Field
import typing as t


class ScrollRequest(BaseModel):
    """Request to scroll up/down in the editor."""

    direction: ScrollDirection = Field(..., description="The direction to scroll")


class ScrollResponse(BaseModel):
    """Response to scroll up/down in the editor."""

    lines: t.Dict[int, str] = Field(
        default={}, description="File content with their line numbers"
    )
    error: str = Field(default="", description="Error message if any")


class Scroll(Action):
    """
    Scrolls the view of the opened file up or down by 100 lines.
    """

    _display_name = "Scroll up/down"
    _tool_name = "filemanagertool"
    _request_schema = ScrollRequest
    _response_schema = ScrollResponse

    def execute(
        self, request_data: ScrollRequest, authorisation_data: dict
    ) -> ScrollResponse:
        workspace = t.cast(Workspace, authorisation_data["workspace"])
        try:
            recent_file = workspace.file_manager._recent
            if recent_file is None:
                return ScrollResponse(error="No file opened")
            recent_file.scroll(direction=request_data.direction)
            lines = recent_file.read()
            return ScrollResponse(lines=lines)
        except FileNotFoundError as e:
            return ScrollResponse(error=f"File not found: {str(e)}")
