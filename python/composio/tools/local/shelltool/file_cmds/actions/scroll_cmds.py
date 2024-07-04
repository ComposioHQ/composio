from typing import cast

from pydantic import Field

from composio.tools.local.shelltool.shell_exec.actions.exec import (
    ExecuteCommand,
    ShellExecRequest,
    ShellExecResponse,
)


class ScrollRequest(ShellExecRequest):
    direction: str = Field(
        ..., description="Direction to scroll, 'up' or 'down'", examples=["down", "up"]
    )


class ScrollResponse(ShellExecResponse):
    pass


class Scroll(ExecuteCommand):
    """
    Scrolls the view within a shell session down by 100 lines.
    """

    _display_name = "Scroll Action"
    _tool_name = "fileedittool"
    _request_schema = ScrollRequest  # Reusing the request schema from SetCursors
    _response_schema = ScrollResponse  # Reusing the response schema from SetCursors

    def execute(
        self, request_data: ShellExecRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        request_data = cast(ScrollRequest, request_data)
        self._setup(request_data)
        cmd = "scroll_down" if request_data.direction == "down" else "scroll_up"
        return self._communicate(cmd)
