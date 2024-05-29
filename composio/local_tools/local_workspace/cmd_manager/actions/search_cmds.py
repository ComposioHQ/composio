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

from .const import SCRIPT_SEARCH


logger = get_logger()


class SearchDirRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )
    search_term: str = Field(..., description="search term to search in the directory")
    dir: str = Field(..., description="The directory to search in (if not provided, searches in the current directory)")


class SearchDirResponse(BaseModel):
    output: str = Field(..., description="output of the command")
    return_code: int = Field(..., description="return code for the command")


class SearchDirCmd(Action):
    """
    Searches for search_term in all files in dir. If dir is not provided, searches in the current directory.
    """

    _display_name = "Search Directory Action"
    _request_schema = SearchDirRequest
    _response_schema = SearchDirResponse
    _tags = ["workspace"]
    _tool_name = "cmdmanagertool"
    script_file = SCRIPT_SEARCH
    command = "search_dir"
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

    def _setup(self, args: SearchDirRequest):
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
        self.logger = logger

    @history_recorder()
    def execute(
        self, request_data: SearchDirRequest, authorisation_data: dict
    ) -> SearchDirResponse:
        if not request_data.dir or not request_data.dir.strip():
            raise ValueError(
                "dir can not be null. Give a directory-name in which to search"
            )
        self._setup(request_data)
        command = f"{self.command} '{request_data.search_term}' {request_data.dir}"  # Command to scroll down 100 lines
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        return SearchDirResponse(output=output, return_code=return_code)


class SearchFileRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )
    search_term: str = Field(..., description="search term to search in the directory")
    file_name: str = Field(
        ..., description="name of the file in which search needs to be done"
    )


class SearchFileResponse(BaseModel):
    output: str = Field(..., description="output of the command")
    return_code: int = Field(..., description="return code for the command")


class SearchFileCmd(Action):
    """
    Searches for a specified term within a specified file or the current open file if none is specified.
    """

    _display_name = "Search file Action"
    _request_schema = SearchFileRequest
    _response_schema = SearchFileResponse
    _tags = ["workspace"]
    _tool_name = "cmdmanagertool"
    script_file = SCRIPT_SEARCH
    command = "search_file"
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

    def _setup(self, args: SearchFileRequest):
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
        self, request_data: SearchFileRequest, authorisation_data: dict
    ) -> SearchDirResponse:
        if not request_data.file_name or not request_data.file_name.strip():
            raise ValueError(
                "dir can not be null. Give a directory-name in which to search"
            )
        self._setup(request_data)
        command = (
            f"{self.command} '{request_data.search_term}' {request_data.file_name}"
        )
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        return SearchDirResponse(output=output, return_code=return_code)


class FindFileRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )
    file_name: str = Field(..., description="The name of the file to be searched for within the specified directory or the current directory if none is specified.")
    dir: str = Field(
        ..., description="The directory within which to search for the file. If not provided, the search will default to the current directory."
    )


class FindFileResponse(BaseModel):
    output: str = Field(..., description="output of the command")
    return_code: int = Field(..., description="return code for the command")


class FindFileCmd(Action):
    """
    Searches for files by name within a specified directory or the current directory if none is specified.
    Example:
        - To find a file, provide the workspace ID, the file name, and optionally a directory. 
        - The response will list any files found and indicate whether the search was successful.
    """

    _display_name = "Find File Action"
    _request_schema = FindFileRequest
    _response_schema = FindFileResponse
    _tags = ["workspace"]
    _tool_name = "cmdmanagertool"
    script_file = SCRIPT_SEARCH
    command = "find_file"
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

    def _setup(self, args: FindFileRequest):
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
        self, request_data: FindFileRequest, authorisation_data: dict
    ) -> FindFileResponse:
        if not request_data.file_name or not request_data.file_name.strip():
            raise ValueError("file-name can not be null. Give a file-name to find")
        if not request_data.dir or not request_data.dir.strip():
            raise ValueError(
                "directory in which file-name needs to be searched cant be empty. Give a directory name"
            )
        self._setup(request_data)
        command = f"{self.command} {request_data.file_name} {request_data.dir}"
        full_command = f"source {self.script_file} && {command}"
        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        return FindFileResponse(output=output, return_code=return_code)
