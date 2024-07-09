from typing import cast

from pydantic import Field

from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT
from composio.tools.local.shelltool.shell_exec.actions.exec import (
    BaseExecCommand,
    ShellExecResponse,
    ShellRequest,
    exec_cmd,
)


class ScrollRequest(ShellRequest):
    direction: str = Field(
        ..., description="Direction to scroll, 'up' or 'down'", examples=["down", "up"]
    )


class ScrollResponse(ShellExecResponse):
    pass


class Scroll(BaseExecCommand):
    """
    Scrolls the view within a shell session down by 100 lines.
    """

    _display_name = "Scroll Action"
    _tool_name = "fileedittool"
    _request_schema = ScrollRequest  # Reusing the request schema from SetCursors
    _response_schema = ScrollResponse  # Reusing the response schema from SetCursors

    def execute(
        self, request_data: ScrollRequest, authorisation_data: dict
    ) -> ScrollResponse:
        request_data = cast(ScrollRequest, request_data)
        cmd = "scroll_down" if request_data.direction == "down" else "scroll_up"
        output = exec_cmd(
            cmd=cmd,
            authorisation_data=authorisation_data,
            shell_id=request_data.shell_id,
        )
        return ScrollResponse(
            stdout=output[STDOUT],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )
