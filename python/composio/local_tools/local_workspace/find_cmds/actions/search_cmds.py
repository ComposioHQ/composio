from pydantic import Field

from composio.local_tools.local_workspace.base_cmd import (
    BaseAction,
    BaseRequest,
    BaseResponse,
)
from composio.local_tools.local_workspace.utils import get_logger


logger = get_logger("workspace")


class SearchDirRequest(BaseRequest):
    search_term: str = Field(..., description="search term to search in the directory")
    directory: str = Field(
        default=".",
        description="The directory to search in (if not provided, searches in the current directory)",
    )


class SearchDirResponse(BaseResponse):
    pass


class SearchDirCmd(BaseAction):
    """
    Searches for search_term in all files in dir. If dir is not provided, searches in the current directory.
    """

    _display_name = "Search Directory Action"
    _tool_name = "searchtool"
    _request_schema = SearchDirRequest
    _response_schema = SearchDirResponse

    def execute(
        self, request_data: SearchDirRequest, authorisation_data: dict
    ) -> BaseResponse:
        if not request_data.directory or not request_data.directory.strip():
            raise ValueError(
                "dir can not be null. Give a directory-name in which to search"
            )
        self._setup(request_data)
        full_command = (
            f"search_dir '{request_data.search_term}' {request_data.directory}"
        )
        return self._communicate(full_command)


class SearchFileRequest(BaseRequest):
    search_term: str = Field(..., description="search term to search in the file")
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
    _tool_name = "searchtool"
    _request_schema = SearchFileRequest
    _response_schema = SearchFileResponse

    def execute(
        self, request_data: SearchFileRequest, authorisation_data: dict
    ) -> BaseResponse:
        if not request_data.file_name or not request_data.file_name.strip():
            raise ValueError(
                "file-name can not be null. Give a file-name in which to search"
            )
        self._setup(request_data)
        full_command = (
            f"search_file '{request_data.search_term}' {request_data.file_name}"
        )
        return self._communicate(full_command)


class FindFileRequest(BaseRequest):
    file_name: str = Field(
        ...,
        description="The name of the file to be searched for within the specified "
        "directory or the current directory if none is specified.",
    )
    dir: str = Field(
        default=".",
        description="The directory within which to search for the file. If not provided, "
        "the search will default to the current directory.",
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
    _tool_name = "searchtool"
    _request_schema = FindFileRequest
    _response_schema = FindFileResponse

    def execute(
        self, request_data: FindFileRequest, authorisation_data: dict
    ) -> BaseResponse:
        if not request_data.file_name or not request_data.file_name.strip():
            raise ValueError("file-name can not be null. Give a file-name to find")
        if not request_data.dir or not request_data.dir.strip():
            raise ValueError(
                "directory in which file-name needs to be searched cant be empty. Give a directory name"
            )
        self._setup(request_data)
        full_command = f"find_file {request_data.file_name} {request_data.dir}"
        return self._communicate(full_command)
