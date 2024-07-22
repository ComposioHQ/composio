import typing as t

from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class FindFileRequest(BaseFileRequest):
    """Request to find files matching a pattern."""

    pattern: str = Field(..., description="Pattern to search for (supports wildcards)")
    depth: t.Optional[int] = Field(
        default=None, description="Max depth to search for (None for unlimited)", ge=0
    )
    case_sensitive: bool = Field(
        default=False, description="If set True the search will be case sensitive"
    )
    include: t.List[str] = Field(
        default=None,
        description="List of directories to search in",
    )
    exclude: t.List[str] = Field(
        default=None,
        description="List of directories to exclude from the search",
    )


class FindFileResponse(BaseFileResponse):
    """Response to find files matching a pattern."""

    results: t.List[str] = Field(
        default=[], description="List of file paths matching the search pattern"
    )
    error: str = Field(default="", description="Error message if any")


class FindFile(BaseFileAction):
    """
    Finds files or directories matching the given pattern in the workspace.

    This action allows you to search for files or directories using glob patterns.
    You can specify various parameters to refine your search, such as search depth,
    case sensitivity, directories to include or exclude.

    The search returns a list of file paths relative to the working directory that
    match the given pattern.

    Usage examples:
    1. Find all Python files:
       pattern: "*.py"
    2. Find all text files starting with "test_":
       pattern: "test_*.txt"
    3. Find all Markdown files in any subdirectory:
       pattern: "**/*.md"
    4. Find CSV files with names like "data001.csv", "data002.csv", etc.:
       pattern: "data???.csv"
    5. Find all "main.js" files in the "src" directory and its subdirectories:
       pattern: "src/**/main.js"

    Note: The search automatically excludes the '.git' directory.

    Returns:
    - A list of file paths (as strings) relative to the working directory that match the search pattern.

    Raises:
    - ValueError: If the pattern is empty or invalid.
    - PermissionError: If there's no permission to access certain directories.
    - OSError: If there's an issue with the file system operations.
    """

    _display_name = "Find Files"
    _request_schema = FindFileRequest
    _response_schema = FindFileResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: FindFileRequest  # type: ignore
    ) -> FindFileResponse:
        try:
            results = file_manager.find(
                pattern=request_data.pattern,
                depth=request_data.depth,
                case_sensitive=request_data.case_sensitive,
                include=request_data.include,  # type: ignore
                exclude=request_data.exclude,  # type: ignore
            )
            return FindFileResponse(results=results)
        except ValueError as e:
            return FindFileResponse(error=f"Invalid search parameters: {str(e)}")
        except PermissionError as e:
            return FindFileResponse(error=f"Permission denied: {str(e)}")
        except OSError as e:
            return FindFileResponse(error=f"File system error: {str(e)}")
