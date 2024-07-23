import typing as t

from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class SearchWordRequest(BaseFileRequest):
    """Request to search for a word in files."""

    word: str = Field(..., description="The term to search for")
    pattern: str = Field(
        default=None,
        description="""The file, directory, or glob pattern to search in.
        If not provided, searches in the current working directory.
        Examples:
        - "*.py" : Search in all Python files in the current directory
        - "src/*.txt" : Search in all text files in the 'src' directory
        - "**/*.md" : Search in all Markdown files in the current directory and all subdirectories
        - "/path/to/specific/file.js" : Search in a specific file
        - "/path/to/directory" : Search in all files in a specific directory""",
    )
    recursive: bool = Field(
        default=True, description="If True, search recursively in subdirectories"
    )


class SearchWordResponse(BaseFileResponse):
    """Response to search for a word in files."""

    results: t.Dict[str, t.List[t.Tuple[int, str]]] = Field(
        default={},
        description="A dictionary with file paths as keys and lists of (line number, line content) tuples as values",
    )
    error: str = Field(default="", description="Error message if any")


class SearchWord(BaseFileAction):
    """
    Searches for a specified word in files matching the given pattern.

    This action allows you to search for a specific word or phrase across multiple files
    in your workspace. You can specify a pattern to narrow down the search to specific
    files, directories, or file types.

    The search is case-sensitive and returns the line numbers and content of the lines
    where the word is found.

    Usage examples:
    1. Search for 'TODO' in all Python files:
       pattern: "*.py", word: "TODO"
    2. Search for 'bug' in all files in the 'src' directory:
       pattern: "src/*", word: "bug"
    3. Search for 'FIXME' in all JavaScript files in any subdirectory:
       pattern: "**/*.js", word: "FIXME"
    4. Search for 'important' in a specific file:
       pattern: "/path/to/specific/file.txt", word: "important"

    Note: The search will skip binary files and hidden files (those starting with a dot).

    Raises:
        - ValueError: If the word to search for is empty.
        - FileNotFoundError: If the specified pattern doesn't match any files.
        - PermissionError: If there's no permission to read certain files.
        - IOError: If there's an issue reading files.
    """

    _display_name = "Search Word in Files"
    _request_schema = SearchWordRequest
    _response_schema = SearchWordResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: SearchWordRequest  # type: ignore
    ) -> SearchWordResponse:
        try:
            results = file_manager.grep(
                word=request_data.word,
                pattern=request_data.pattern,
                recursive=request_data.recursive,
            )
            return SearchWordResponse(results=results)
        except ValueError as e:
            return SearchWordResponse(error=f"Invalid search parameters: {str(e)}")
        except FileNotFoundError as e:
            return SearchWordResponse(
                error=f"No files found matching the pattern: {str(e)}"
            )
        except PermissionError as e:
            return SearchWordResponse(error=f"Permission denied: {str(e)}")
        except IOError as e:
            return SearchWordResponse(error=f"Error reading files: {str(e)}")
