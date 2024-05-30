from pydantic import BaseModel, Field

from composio.local_tools.action import Action
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    communicate,
)

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
    script_file = SCRIPT_CURSOR_DEFAULT
    command = "scroll_down"

    @history_recorder()
    def execute(
        self, request_data: ScrollDownRequest, authorisation_data: dict
    ) -> ScrollDownResponse:
        self._setup(request_data)
        command = f"{self.command}"  # Command to scroll down 100 lines
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        output, return_code = self.process_output(output, return_code)
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
    script_file = SCRIPT_CURSOR_DEFAULT
    command = "scroll_up"

    @history_recorder()
    def execute(
        self, request_data: ScrollDownRequest, authorisation_data: dict
    ) -> ScrollDownResponse:
        self._setup(request_data)
        command = f"{self.command}"  # Command to scroll down 100 lines
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        output, return_code = self.process_output(output, return_code)
        return ScrollDownResponse(output=output, return_code=return_code)
