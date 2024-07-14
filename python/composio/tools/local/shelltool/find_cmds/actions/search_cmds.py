from pydantic import Field

from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT
from composio.tools.local.shelltool.shell_exec.actions.exec import (
    BaseExecCommand,
    ShellExecResponse,
    ShellRequest,
    exec_cmd,
)
from composio.utils.logging import get as get_logger


logger = get_logger("workspace")


class SearchDirRequest(ShellRequest):
    search_term: str = Field(..., description="search term to search in the directory")
    directory: str = Field(
        default=".",
        description="The directory to search in (if not provided, searches in the current directory)",
    )


class SearchDirResponse(ShellExecResponse):
    pass


class SearchDirCmd(BaseExecCommand):
    """
    Searches for search_term in all files in dir. If dir is not provided, searches in the current directory.
    """

    _display_name = "Search Directory Action"
    _tool_name = "searchtool"
    _request_schema = SearchDirRequest
    _response_schema = SearchDirResponse

    def execute(
        self, request_data: SearchDirRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        output = exec_cmd(
            cmd=f"search_dir '{request_data.search_term}' {request_data.directory}",
            authorisation_data=authorisation_data,
            shell_id=request_data.shell_id,
        )
        return SearchDirResponse(
            stdout=output[STDOUT],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )


class SearchFileRequest(ShellRequest):
    search_term: str = Field(..., description="search term to search in the file")
    file_name: str = Field(
        ..., description="name of the file in which search needs to be done"
    )


class SearchFileResponse(ShellExecResponse):
    pass


class SearchFileCmd(BaseExecCommand):
    """
    Searches for a specified term within a specified file or the current open file if none is specified.
    """

    _display_name = "Search file Action"
    _tool_name = "searchtool"
    _request_schema = SearchFileRequest
    _response_schema = SearchFileResponse

    def execute(
        self, request_data: SearchFileRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        output = exec_cmd(
            cmd=f"search_file '{request_data.search_term}' {request_data.file_name}",
            authorisation_data=authorisation_data,
            shell_id=request_data.shell_id,
        )
        return SearchFileResponse(
            stdout=output[STDOUT],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )


class FindFileRequest(ShellRequest):
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


class FindFileResponse(ShellExecResponse):
    pass


class FindFileCmd(BaseExecCommand):
    """
    Searches for files by name within a specified directory or the current directory if none is specified.
    Example:
        - To find a file, provide the file name, and optionally a directory.
        - The response will list any files found and indicate whether the search was successful.
    """

    _display_name = "Find File Action"
    _tool_name = "searchtool"
    _request_schema = FindFileRequest
    _response_schema = FindFileResponse

    def execute(
        self, request_data: FindFileRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        output = exec_cmd(
            cmd=f"find_file {request_data.file_name} {request_data.dir}",
            authorisation_data=authorisation_data,
            shell_id=request_data.shell_id,
        )
        return FindFileResponse(
            stdout=output[STDOUT],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )
