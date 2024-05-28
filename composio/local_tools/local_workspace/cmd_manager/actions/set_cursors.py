from pydantic import BaseModel, Field

from composio.local_tools.action import Action
from composio.local_tools.local_workspace.commons.local_docker_workspace import (get_workspace_meta_from_manager,
                                                                    communicate, WorkspaceManagerFactory, get_container_process,
                                                                    KEY_IMAGE_NAME, KEY_CONTAINER_NAME,
                                                                    KEY_WORKSPACE_MANAGER, KEY_PARENT_PIDS)
from composio.local_tools.local_workspace.commons.utils import get_container_by_container_name
from composio.local_tools.local_workspace.commons.history_processor import HistoryProcessor, history_recorder
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from .const import SCRIPT_CURSOR_DEFAULT

logger = get_logger()


class SetCursorsRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id to get the running workspace-manager")
    start_line: int = Field(..., description="start line of the cursor")
    end_line: int = Field(..., description="end line of the cursor")


class SetCursorsResponse(BaseModel):
    output: str = Field(..., description="output of the command")
    return_code: int = Field(..., description="return code for the command")


class SetCursors(Action):
    """
    Sets the start and end cursors based on the provided line numbers, with checks to ensure the file is open,
    the arguments are numbers, and the start line is less than or equal to the end line.

    Raises:
    - ValueError: If start_line or end_line are not integers, or if start_line > end_line.
    - RuntimeError: If no file is currently open.
    """
    _display_name = "Run command on workspace"
    _request_schema = SetCursorsRequest
    _response_schema = SetCursorsResponse
    _tags = ["workspace"]
    script_file = SCRIPT_CURSOR_DEFAULT
    command = "set_cursors"
    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def set_workspace_and_history(self, workspace_factory: WorkspaceManagerFactory,
                                  history_processor: HistoryProcessor):
        self.workspace_factory = workspace_factory
        self.history_processor = history_processor

    def _setup(self, args: SetCursorsRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        self.start_line = args.start_line
        self.end_line = args.end_line
        workspace_meta = get_workspace_meta_from_manager(self.workspace_factory, self.workspace_id)
        self.image_name = workspace_meta[KEY_IMAGE_NAME]
        self.container_name = workspace_meta[KEY_CONTAINER_NAME]
        self.container_process = get_container_process(workspace_meta[KEY_WORKSPACE_MANAGER])
        self.parent_pids = workspace_meta[KEY_PARENT_PIDS]
        self.container_obj = get_container_by_container_name(self.container_name, self.image_name)
        if not self.container_obj:
            raise Exception(f"container-name {self.container_name} is not a valid docker-container")
        self.logger = logger

    @history_recorder()
    def execute(self, request_data: SetCursorsRequest, authorisation_data: dict) -> SetCursorsResponse:
        """Executes a shell script command inside the Docker container."""
        self._setup(request_data)
        command = f"{self.command} {' '.join([str(self.start_line), str(self.end_line)])}"
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(self.container_process,
                                          self.container_obj,
                                          full_command,
                                          self.parent_pids, )
        return SetCursorsResponse(output=output, return_code=return_code)


