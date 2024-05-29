from pydantic import BaseModel, Field

from composio.local_tools.action import Action
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    KEY_CONTAINER_NAME,
    KEY_IMAGE_NAME,
    KEY_PARENT_PIDS,
    KEY_WORKSPACE_MANAGER,
    WorkspaceManagerFactory,
    communicate,
    get_container_process,
    get_workspace_meta_from_manager,
)
from composio.local_tools.local_workspace.commons.utils import (
    get_container_by_container_name,
)

from .const import SCRIPT_EDIT_LINTING


logger = get_logger()


class EditFileRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )
    start_line: int = Field(..., description="the line number to start the edit at")
    end_line: int = Field(
        ..., description="the line number to end the edit at (inclusive)"
    )
    replacement_text: str = Field(
        ..., description="the text to replace the current selection with"
    )


class EditFileResponse(BaseModel):
    output: str = Field(..., description="output of the command")
    return_code: int = Field(..., description="return code for the command")


class EditFile(Action):
    """
    Moves the window down 100 lines.
    """

    _display_name = """
    replaces *all* of the text between the START CURSOR and the END CURSOR with the replacement_text.
    The replacement text is terminated by a line with only end_of_edit on it. All of the <replacement_text>
    will be entered, so make sure your indentation is formatted properly. To enter text at the beginning of the file,
    set START CURSOR and END CURSOR to 0. Use set_cursors to move the cursors around.
    Python files will be checked for syntax errors after the edit.
    """
    _request_schema = EditFileRequest  # Reusing the request schema from SetCursors
    _response_schema = EditFileResponse  # Reusing the response schema from SetCursors
    _tags = ["workspace"]
    _tool_name = "cmdmanagertool"
    script_file = SCRIPT_EDIT_LINTING
    command = "edit"
    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def __init__(self):
        super().__init__()
        self.args = None
        self.workspace_id = ""
        self.image_name = ""
        self.container_name = ""
        self.container_process = None
        self.parent_pids = []
        self.container_obj = None
        self.logger = logger

    def set_workspace_and_history(
        self,
        workspace_factory: WorkspaceManagerFactory,
        history_processor: HistoryProcessor,
    ):
        self.workspace_factory = workspace_factory
        self.history_processor = history_processor

    def _setup(self, args: EditFileRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        workspace_meta = get_workspace_meta_from_manager(
            self.workspace_factory, self.workspace_id
        )
        self.image_name = workspace_meta[KEY_IMAGE_NAME]
        self.container_name = workspace_meta[KEY_CONTAINER_NAME]
        self.container_process = get_container_process(
            workspace_meta[KEY_WORKSPACE_MANAGER]
        )
        self.parent_pids = workspace_meta[KEY_PARENT_PIDS]
        self.container_obj = get_container_by_container_name(
            self.container_name, self.image_name
        )
        if not self.container_obj:
            raise ValueError(
                f"container-name {self.container_name} is not a valid docker-container"
            )

    @history_recorder()
    def execute(
        self, request_data: EditFileRequest, authorisation_data: dict
    ) -> EditFileResponse:
        self._setup(request_data)
        full_command = f"source {self.script_file} && edit {request_data.start_line}:{request_data.end_line} << end_of_edit\n{request_data.replacement_text}\nend_of_edit"
        # print(full_command)
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        # in case of exceptions --> return-code is none
        exception_output = ""
        if return_code is None:
            return_code = 1
            exception_output = "Exception: " + output
        return EditFileResponse(
            output=exception_output if exception_output else output,
            return_code=return_code,
        )
