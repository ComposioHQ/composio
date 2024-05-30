from pydantic import BaseModel, Field

from composio.local_tools.action import Action
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    communicate,
)

from .const import SCRIPT_SEARCH
from .base_class import BaseRequest, BaseResponse, BaseAction

logger = get_logger()


class SearchDirRequest(BaseRequest):
    search_term: str = Field(..., description="search term to search in the directory")
    dir: str = Field(
        ...,
        description="The directory to search in (if not provided, searches in the current directory)",
    )


class SearchDirResponse(BaseResponse):
    pass


class SearchDirCmd(BaseAction):
    """
    Searches for search_term in all files in dir. If dir is not provided, searches in the current directory.
    """

    _display_name = "Search Directory Action"
    _request_schema = SearchDirRequest
    _response_schema = SearchDirResponse
    script_file = SCRIPT_SEARCH
    command = "search_dir"

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
        output, return_code = self.process_output(output, return_code)
        return SearchDirResponse(output=output, return_code=return_code)


class SearchFileRequest(BaseRequest):
    search_term: str = Field(..., description="search term to search in the directory")
    file_name: str = Field(
        ..., description="name of the file in which search needs to be done"
    )


class SearchFileResponse(BaseResponse):
    pass


class SearchFileCmd(BaseAction):
    """
    Searches for a specified term within a specified file or the current open file if none is specified.
    """

    _display_name = "Search file Action"
    _request_schema = SearchFileRequest
    _response_schema = SearchFileResponse
    script_file = SCRIPT_SEARCH
    command = "search_file"

    @history_recorder()
    def execute(
        self, request_data: SearchFileRequest, authorisation_data: dict
    ) -> SearchFileResponse:
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
        output, return_code = self.process_output(output, return_code)
        return SearchFileResponse(output=output, return_code=return_code)


class FindFileRequest(BaseRequest):
    file_name: str = Field(
        ...,
        description="The name of the file to be searched for within the specified directory or the current directory if none is specified.",
    )
    dir: str = Field(
        ...,
        description="The directory within which to search for the file. If not provided, the search will default to the current directory.",
    )


class FindFileResponse(BaseResponse):
    pass


class FindFileCmd(BaseAction):
    """
    Searches for files by name within a specified directory or the current directory if none is specified.
    Example:
        - To find a file, provide the workspace ID, the file name, and optionally a directory.
        - The response will list any files found and indicate whether the search was successful.
    """

    _display_name = "Find File Action"
    _request_schema = FindFileRequest
    _response_schema = FindFileResponse
    script_file = SCRIPT_SEARCH
    command = "find_file"

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
        output, return_code = self.process_output(output, return_code)
        return FindFileResponse(output=output, return_code=return_code)
