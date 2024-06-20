from pydantic import Field

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    communicate,
)
from composio.local_tools.local_workspace.commons.utils import process_output

from .base_class import BaseAction, BaseRequest, BaseResponse
from .const import SCRIPT_CURSOR_DEFAULT


logger = get_logger()


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
        self.script_file = SCRIPT_CURSOR_DEFAULT
        if request_data.direction == "down":
            self.command = "scroll_down"
        else:
            self.command = "scroll_up"
        if self.container_process is None:
            raise ValueError("Container process is not set")
        output, return_code = communicate(
            self.container_process, self.container_obj, self.command, self.parent_pids
        )
        output, return_code = process_output(output, return_code)
        return BaseResponse(output=output, return_code=return_code)
