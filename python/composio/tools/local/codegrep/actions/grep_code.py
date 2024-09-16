from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.base.utils.grep_utils import grep_util


class CodeSearchRequest(BaseModel):
    query: str = Field(
        ...,
        description="""The search pattern or regular expression to find in the codebase.
Use this to locate specific code constructs, function definitions,
variable names, or text patterns.""",
        examples=["def main(", "TODO:", "import numpy"],
    )
    code_directory: str = Field(
        default=str(Path.home()),
        description="""The code directory to start the search from.
This should be the top-level folder of your project or codebase.
If not specified, the search will start from the user's home directory.
""",
        examples=["/path/to/project", "/home/user/workspace/my-app"],
    )
    file_paths: List[str] = Field(
        default=None,
        description="""A list of specific file paths to search within.
Use this when you want to limit the search to particular files or subdirectories.
If not provided, the search will cover all files under the root_directory.""",
        examples=[
            ["/path/to/project/src/main.py", "/path/to/project/tests/test_main.py"],
            ["app/models.py", "app/views.py", "app/controllers.py"],
        ],
    )


class SearchResult(BaseModel):
    file_path: str
    matched_content: str


class CodeSearchResponse(BaseModel):
    matches: List[SearchResult] = Field(
        ...,
        description="A list of search results, each containing the file path and the matched content.",
    )
    error: Optional[str] = Field(
        default=None,
        description="An error message describing any issues encountered during the search process. This field is None if the search was successful.",
    )


class SearchCodebase(LocalAction[CodeSearchRequest, CodeSearchResponse]):
    """
    Performs an advanced search across a codebase using regex patterns, similar to the grep command but optimized for large-scale software projects.

    This action is ideal for when you need to quickly locate specific code patterns, function definitions, or text within a large codebase. It's particularly useful for:
    - Finding all occurrences of a particular function or class
    - Locating TODO comments or specific error handling patterns
    - Identifying usage of certain libraries or API calls
    - Searching for potential security vulnerabilities or code smells

    The search is performed efficiently and can handle large codebases by leveraging optimized search algorithms and respecting version control ignore files.

    Example usage: # Searches for function definitions starting with 'process_data'
    search_request =
    query="def process_data(",
    code_directory="/project",

    This action provides a powerful tool for code analysis, refactoring assistance, and codebase exploration tasks.
    """

    display_name = "Advanced Codebase Search"
    _tags = ["search", "code-analysis"]

    def execute(self, request: CodeSearchRequest, metadata: dict) -> CodeSearchResponse:
        search_paths = request.file_paths or [request.code_directory]
        grep_results = grep_util(
            pattern=request.query,
            filenames=search_paths,
            no_gitignore=False,
        )
        formatted_results = [
            SearchResult(
                file_path=result["filename"], matched_content=result["matches"]
            )
            for result in grep_results
        ]
        return CodeSearchResponse(matches=formatted_results)
