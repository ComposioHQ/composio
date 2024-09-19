import typing as t

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.env.filemanager.file import ScrollDirection
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


class ScrollRequest(BaseFileRequest):
    """Request to scroll up/down in the editor."""

    direction: str = Field(
        default="down",
        description="The direction to scroll: up/down, by default it's down",
        title="ScrollDirection",
    )
    lines: int = Field(
        default=0,
        description="How many lines to scroll by. Choose between 1 to 1000. 1 means scroll by 1 line, 100 means scroll by 100 lines.",
    )
    scroll_id: int = Field(
        default=0,
        description="""Unique ID for each scroll request.
        Enables consecutive scrolls in agentic frameworks that block same function calls consecutively.
        Please increment and pass if you are calling this function consecutively.""",
    )


class ScrollResponse(BaseFileResponse):
    """Response to scroll up/down in the editor."""

    message: str = Field(
        default="",
        description="Message to display to the user",
    )
    lines: str = Field(
        default="",
        description="File content with their line numbers",
    )
    error: str = Field(
        default="",
        description="Error message if any",
    )


class Scroll(LocalAction[ScrollRequest, ScrollResponse]):
    """
    Scrolls the view of the opened file up or down by 100 lines.
    Returns:
    - A dictionary of line numbers and their content for the new view window.
    - An error message if no file is open or if the file is not found.

    Use SearchWord Action to search for a specific word in the file in case
    the file is long, as scrolling is not efficient for large files.

    Raises:
    - FileNotFoundError: If the file is not found.
    """

    @include_cwd  # type: ignore
    def execute(self, request: ScrollRequest, metadata: t.Dict) -> ScrollResponse:
        try:
            recent_file = self.filemanagers.get(id=request.file_manager_id).recent
            if recent_file is None:
                return ScrollResponse(error="No open file found!")

            recent_file.scroll(
                lines=request.lines,
                direction=ScrollDirection(request.direction),
            )
            return ScrollResponse(
                message="Scroll successful.",
                lines=recent_file.format_text(recent_file.read()),
            )
        except FileNotFoundError as e:
            return ScrollResponse(error=f"File not found: {str(e)}")
