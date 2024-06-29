from pydantic import Field

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)

from .base_class import BaseAction, BaseRequest, BaseResponse


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
    _request_schema = ScrollRequest  # Reusing the request schema from SetCursors
    _response_schema = ScrollResponse  # Reusing the response schema from SetCursors

    @history_recorder()
    def execute(
        self, request_data: ScrollRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)
        self.command = (
            "scroll_down" if request_data.direction == "down" else "scroll_up"
        )
        return self._communicate(self.command)
