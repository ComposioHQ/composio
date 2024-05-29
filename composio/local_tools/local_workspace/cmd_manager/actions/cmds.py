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

from .const import SCRIPT_CURSOR_DEFAULT


logger = get_logger()


class GoToRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )
    line_number: int = Field(..., description="line number to navigate to")


class GoToResponse(BaseModel):
    execution_output: str = Field(..., description="output of the execution")
    return_code: int = Field(..., description="return code for the command")


class GoToLineNumInOpenFile(Action):
    """
    Navigates to a specific line number in the open file, with checks to ensure the file is open
    and the line number is a valid number.

    Args:
    - line_number (int): The line number to navigate to.

    Raises:
    - ValueError: If line_number is not an integer.
    - RuntimeError: If no file is currently open.
    """

    _display_name = "Navigate to line in open-file in the workspace"
    _request_schema = GoToRequest
    _response_schema = GoToResponse
    _tags = ["workspace"]
    script_file = SCRIPT_CURSOR_DEFAULT
    command = "goto"
    _tool_name = "cmdmanagertool"
    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def __init__(self):
        super().__init__()
        self.args = None
        self.workspace_id = ""
        self.line_number = -1
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

    def _setup(self, args: GoToRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        self.line_number = args.line_number
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
        self, request_data: GoToRequest, authorisation_data: dict
    ) -> GoToResponse:
        self._setup(request_data)
        command = f"{self.command} {str(self.line_number)}"
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        return GoToResponse(execution_output=output, return_code=return_code)


class CreateFileRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )
    file_name: str = Field(..., description="name of the file to create")


class CreateFileResponse(BaseModel):
    execution_output: str = Field(..., description="output of the execution")
    return_code: int = Field(..., description="return code for the command")


class CreateFileCmd(Action):
    """
    creates and opens a new file with the given name

    Raises:
    - ValueError: If line_number is not an integer.
    - RuntimeError: If no file is currently open.
    """

    _display_name = "Create and open a new file"
    _request_schema = CreateFileRequest
    _response_schema = CreateFileResponse
    _tags = ["workspace"]
    _tool_name = "cmdmanagertool"
    script_file = SCRIPT_CURSOR_DEFAULT
    command = "create"
    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def __init__(self):
        super().__init__()
        self.args = None
        self.workspace_id = ""
        self.file_name = ""
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

    def _setup(self, args: CreateFileRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        self.file_name = args.file_name
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

    def validate_file_name(self):
        if not self.file_name or self.file_name.strip():
            return ValueError("file-name can not be empty")
        return True

    @history_recorder()
    def execute(
        self, request_data: CreateFileRequest, authorisation_data: dict
    ) -> CreateFileResponse:
        self._setup(request_data)
        self.validate_file_name()
        command = f"{self.command} {str(self.file_name)}"
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        return CreateFileResponse(execution_output=output, return_code=return_code)


class OpenCmdRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )
    file_name: str = Field(..., description="file path to open in the editor")
    line_number: int = Field(
        default=0,
        description="if file-number is given, file will be open from that line number",
    )


class OpenCmdResponse(BaseModel):
    output: str = Field(..., description="output of the execution")
    return_code: int = Field(..., description="return code for the command")


class OpenFile(Action):
    """
    Opens a file in the editor based on the provided file path,
    If line_number is provided, the window will be move to include that line

    Raises:
    - ValueError: If file_path is not a string or if the file does not exist.
    - RuntimeError: If no file is currently open.
    """

    _display_name = "Open File on workspace"
    _request_schema = OpenCmdRequest
    _response_schema = OpenCmdResponse
    _tags = ["workspace"]
    _tool_name = "cmdmanagertool"
    script_file = SCRIPT_CURSOR_DEFAULT
    command = "open"
    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def __init__(self):
        super().__init__()
        self.args = None
        self.workspace_id = ""
        self.file_path = ""
        self.line_number = ""
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

    def _setup(self, args: OpenCmdRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        self.file_path = args.file_name
        self.line_number = args.line_number
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
        self, request_data: OpenCmdRequest, authorisation_data: dict
    ) -> OpenCmdResponse:
        self._setup(request_data)
        command = f"{self.command} {self.file_path}"
        if self.line_number != 0:
            command += f"{self.line_number}"
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        return OpenCmdResponse(output=output, return_code=return_code)
