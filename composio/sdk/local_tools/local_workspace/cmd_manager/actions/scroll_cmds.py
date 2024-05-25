from pydantic import BaseModel, Field

from composio.sdk.local_tools.lib.action import Action
from composio.sdk.local_tools.local_workspace.commons.local_docker_workspace import (get_workspace_meta_from_manager,
                                                                    communicate,
                                                                    KEY_IMAGE_NAME, KEY_CONTAINER_NAME,
                                                                    KEY_WORKSPACE_MANAGER, KEY_PARENT_PIDS)
from composio.sdk.local_tools.local_workspace.commons.utils import get_container_by_container_name
from composio.sdk.local_tools.local_workspace.commons.get_logger import get_logger

logger = get_logger()


class ScrollDownRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id to get the running workspace-manager")


class ScrollDownResponse(BaseModel):
    output: str = Field(..., description="output of the command")
    return_code: int = Field(..., description="return code for the command")


class ScrollDown(Action):
    """
    Moves the window down 100 lines.
    """
    _display_name = "Scroll down command on workspace"
    _request_schema = ScrollDownRequest  # Reusing the request schema from SetCursors
    _response_schema = ScrollDownResponse  # Reusing the response schema from SetCursors
    _tags = ["workspace"]
    script_file = "/root/commands/cursor_defaults.sh"
    command = "scroll_down"

    def _setup(self, args: ScrollDownRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        workspace_meta = get_workspace_meta_from_manager(self.workspace_id)
        self.image_name = workspace_meta[KEY_IMAGE_NAME]
        self.container_name = workspace_meta[KEY_CONTAINER_NAME]
        self.container_process = workspace_meta[KEY_WORKSPACE_MANAGER]
        self.parent_pids = workspace_meta[KEY_PARENT_PIDS]
        self.container_obj = get_container_by_container_name(self.container_name, self.image_name)
        if not self.container_obj:
            raise Exception(f"container-name {self.container_name} is not a valid docker-container")
        self.logger = logger

    def execute(self, request_data: ScrollDownRequest, authorisation_data: dict) -> ScrollDownResponse:
        self._setup(request_data)
        command = f"{self.command}"  # Command to scroll down 100 lines
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(self.container_process,
                                          self.container_obj,
                                          full_command,
                                          self.parent_pids)
        return ScrollDownResponse(output=output, return_code=return_code)


class ScrollUpRequest(BaseModel):
    workspace_id: str = Field(..., description="moves the window up 100 lines")


class ScrollUpResponse(BaseModel):
    output: str = Field(..., description="output of the command")
    return_code: int = Field(..., description="return code for the command")


class ScrollUp(Action):
    """
    Moves the window up 100 lines.
    """
    _display_name = "Scroll up command on workspace"
    _request_schema = ScrollUpRequest  # Reusing the request schema from SetCursors
    _response_schema = ScrollUpResponse  # Reusing the response schema from SetCursors
    _tags = ["workspace"]
    script_file = "/root/commands/cursor_defaults.sh"
    command = "scroll_up"

    def _setup(self, args: ScrollDownRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        workspace_meta = get_workspace_meta_from_manager(self.workspace_id)
        self.image_name = workspace_meta[KEY_IMAGE_NAME]
        self.container_name = workspace_meta[KEY_CONTAINER_NAME]
        self.container_process = workspace_meta[KEY_WORKSPACE_MANAGER]
        self.parent_pids = workspace_meta[KEY_PARENT_PIDS]
        self.container_obj = get_container_by_container_name(self.container_name, self.image_name)
        if not self.container_obj:
            raise Exception(f"container-name {self.container_name} is not a valid docker-container")
        self.logger = logger

    def execute(self, request_data: ScrollDownRequest, authorisation_data: dict) -> ScrollDownResponse:
        self._setup(request_data)
        command = f"{self.command}"  # Command to scroll down 100 lines
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(self.container_process,
                                          self.container_obj,
                                          full_command,
                                          self.parent_pids)
        return ScrollDownResponse(output=output, return_code=return_code)
