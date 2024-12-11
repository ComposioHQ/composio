import typing as t

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


class SearchWordRequest(BaseFileRequest):
    """Request to search for a word in files."""

    word: str = Field(..., description="The term to search for")
    pattern: t.Optional[str] = Field(
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
    case_insensitive: bool = Field(
        default=True, description="If True, perform case-insensitive search"
    )
    exclude: t.Optional[t.List[str]] = Field(
        default=None,
        description="List of directories to exclude from the search",
    )


class SearchWordResponse(BaseFileResponse):
    """Response to search for a word in files."""

    results: t.Dict[str, t.List[t.Tuple[int, str]]] = Field(
        default={},
        description="A dictionary with file paths as keys and lists of (line number, line content) tuples as values",
    )
    message: str = Field(default="", description="Message to display to the user")
    error: str = Field(default="", description="Error message if any")


class SearchWord(LocalAction[SearchWordRequest, SearchWordResponse]):
    """
    - Search for a specific word or phrase across multiple files
    in your workspace by specifying a pattern.
    You can specify a pattern to narrow down the search to specific
    files, directories, or file types.
    The search returns the line numbers and content of the lines
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
    """

    @include_cwd  # type: ignore
    def execute(
        self, request: SearchWordRequest, metadata: t.Dict
    ) -> SearchWordResponse:
        try:
            results = self.filemanagers.get(request.file_manager_id).grep(
                word=request.word,
                pattern=request.pattern,
                recursive=request.recursive,
                case_insensitive=request.case_insensitive,
                exclude=request.exclude,  # type: ignore
            )
            num_files: int = len(results)
            if num_files > 100:
                return SearchWordResponse(
                    results=dict(list(results.items())[:100]),
                    message=(
                        f'Warning: More than 100 files matched for "{request.word}" '
                        f'in "{request.pattern}". Sending the first 100 results. '
                        "Consider narrowing your search."
                    ),
                )
            if num_files == 0:
                return SearchWordResponse(
                    results={},
                    message=f'No files matched for "{request.word}" in {request.pattern}".',
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
