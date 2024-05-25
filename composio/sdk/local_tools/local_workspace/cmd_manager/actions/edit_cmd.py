from pydantic.v1 import BaseModel, Field

from composio.sdk.local_tools.lib.action import Action
from composio.sdk.local_tools.local_workspace.commons.local_docker_workspace import (get_workspace_meta_from_manager,
                                                                    communicate,
                                                                    KEY_IMAGE_NAME, KEY_CONTAINER_NAME,
                                                                    KEY_WORKSPACE_MANAGER, KEY_PARENT_PIDS)
from composio.sdk.local_tools.local_workspace.commons.utils import get_container_by_container_name
from composio.sdk.local_tools.local_workspace.commons.get_logger import get_logger

logger = get_logger()


class EditFileRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id to get the running workspace-manager")
    edit_content: str = Field(..., description="the text to replace the current selection with")


class EditFileResponse(BaseModel):
    output: str = Field(..., description="output of the command")
    return_code: int = Field(..., description="return code for the command")


class EditFile(Action):
    """
    Moves the window down 100 lines.
    """
    _display_name = """
    replaces *all* of the text between the START CURSOR and the END CURSOR with the replacement_text. 
    The replacement text is terminated by a line with only end_of_edit on it. All of the <replacement_text> will be entered, 
    so make sure your indentation is formatted properly. To enter text at the beginning of the file, 
    set START CURSOR and END CURSOR to 0. Use set_cursors to move the cursors around. 
    Python files will be checked for syntax errors after the edit.
    """
    _request_schema = EditFileRequest  # Reusing the request schema from SetCursors
    _response_schema = EditFileResponse  # Reusing the response schema from SetCursors
    _tags = ["workspace"]
    script_file = "/root/commands/edit_linting.sh"
    command = "edit"

    def _setup(self, args: EditFileRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        self.edit_content = args.edit_content
        workspace_meta = get_workspace_meta_from_manager(self.workspace_id)
        self.image_name = workspace_meta[KEY_IMAGE_NAME]
        self.container_name = workspace_meta[KEY_CONTAINER_NAME]
        self.container_process = workspace_meta[KEY_WORKSPACE_MANAGER]
        self.parent_pids = workspace_meta[KEY_PARENT_PIDS]
        self.container_obj = get_container_by_container_name(self.container_name, self.image_name)
        if not self.container_obj:
            raise Exception(f"container-name {self.container_name} is not a valid docker-container")
        self.logger = logger

    def execute(self, request_data: EditFileRequest, authorisation_data: dict) -> EditFileResponse:
        self._setup(request_data)
        command = f"{self.command}"
        full_command = f"source {self.script_file} && {command} && {self.edit_content}"
        output, return_code = communicate(self.container_process,
                                          self.container_obj,
                                          full_command,
                                          self.parent_pids)
        return EditFileResponse(output=output, return_code=return_code)