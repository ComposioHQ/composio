from pydantic import BaseModel, Field

from composio.local_tools.action import Action
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


class ScrollDownRequest(BaseRequest):
    pass


class ScrollDownResponse(BaseResponse):
    pass


class ScrollDown(BaseAction):
    """
    Scrolls the view within a shell session down by 100 lines
    """

    _display_name = "Scroll down"
    _request_schema = ScrollDownRequest  # Reusing the request schema from SetCursors
    _response_schema = ScrollDownResponse  # Reusing the response schema from SetCursors

    @history_recorder()
    def execute(
        self, request_data: ScrollDownRequest, authorisation_data: dict
    ) -> ScrollDownResponse:
        self._setup(request_data)
        self.script_file = SCRIPT_CURSOR_DEFAULT
        self.command = "scroll_down"
        if self.container_process is None:
            raise ValueError("Container process is not set")
        full_command = f"{self.command}"  # Command to scroll down 100 lines
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        output, return_code = process_output(output, return_code)
        return ScrollDownResponse(output=output, return_code=return_code)


class ScrollUpRequest(BaseRequest):
    pass


class ScrollUpResponse(BaseResponse):
    pass


class ScrollUp(BaseAction):
    """
    Scrolls the view within a shell session either up by 100 lines
    """

    _display_name = "Scroll up"
    _request_schema = ScrollUpRequest  # Reusing the request schema from SetCursors
    _response_schema = ScrollUpResponse  # Reusing the response schema from SetCursors

    @history_recorder()
    def execute(
        self, request_data: ScrollDownRequest, authorisation_data: dict
    ) -> ScrollDownResponse:
        self._setup(request_data)
        self.script_file = SCRIPT_CURSOR_DEFAULT
        self.command = "scroll_up"
        full_command = f"{self.command}"  # Command to scroll down 100 lines
        if self.container_process is None:
            raise ValueError("Container process is not set")
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        output, return_code = process_output(output, return_code)
        return ScrollDownResponse(output=output, return_code=return_code)
