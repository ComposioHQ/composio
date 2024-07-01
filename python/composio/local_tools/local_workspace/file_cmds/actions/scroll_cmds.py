from pydantic import Field

from composio.local_tools.local_workspace.base_cmd import (
    BaseAction,
    BaseRequest,
    BaseResponse,
)
from composio.workspace.get_logger import get_logger


logger = get_logger("workspace")


class ScrollRequest(BaseRequest):
    direction: str = Field(
        ..., description="Direction to scroll, 'up' or 'down'", examples=["down", "up"]
    )


class ScrollResponse(BaseResponse):
    pass


class Scroll(BaseAction):
    """
    Scrolls the view within a shell session down by 100 lines.
    """

    _display_name = "Scroll Action"
    _tool_name = "filetool"
    _request_schema = ScrollRequest  # Reusing the request schema from SetCursors
    _response_schema = ScrollResponse  # Reusing the response schema from SetCursors

    def execute(
        self, request_data: ScrollRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)
        cmd = "scroll_down" if request_data.direction == "down" else "scroll_up"
        return self._communicate(cmd)
