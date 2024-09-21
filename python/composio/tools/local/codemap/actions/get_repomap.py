from pathlib import Path
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.base.utils.grep_utils import get_files_excluding_gitignore
from composio.tools.local.base.utils.repomap import RepoMap


class GetRepoMapRequest(BaseModel):
    code_directory: str = Field(
        ...,
        description="Absolute path to the root directory of the repository or codebase.",
        examples=[
            "/home/user/projects/my-repo",
            "/Users/username/Documents/my-project",
            "/project",
        ],
    )
    files_of_interest: List[str] = Field(
        default=[],
        description="List of file paths (relative to repository root) that are of particular interest for generating the repo map",
        examples=[
            ["src/main.py", "tests/test_main.py", "README.md"],
            ["main.py", "test_main.py", "README.md"],
        ],
    )
    primary_file_paths: List[str] = Field(
        default=[],
        description="List of file paths (relative to repository root) that around which the repo map should be generated. Primary file won't be included in the repo map.",
    )
    mentioned_idents: List[str] = Field(
        default=[],
        description="List of identifiers (e.g. function names, class names) that the focus of the repo map should be on",
    )


class GetRepoMapResponse(BaseModel):
    repository_map: Optional[str] = Field(
        default=None,
        description="Generated repository map as a string, containing a structured view of important code elements",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Detailed error message if an error occurred during map generation",
    )


class GetRepoMap(LocalAction[GetRepoMapRequest, GetRepoMapResponse]):
    """
    Generates a comprehensive repository map for specified files of interest within a given repository.

    This action analyzes the repository structure, focusing on the files specified as 'files_of_interest'.
    It provides a structured view of important code elements, helping software agents understand
    the layout and key components of the codebase.
    """

    _tags = ["repository", "code-structure", "analysis"]

    def execute(self, request: GetRepoMapRequest, metadata: Dict) -> GetRepoMapResponse:
        repo_root = Path(request.code_directory).resolve()
        if not repo_root.exists():
            return GetRepoMapResponse(
                error_message=f"Repository root path '{repo_root}' does not exist or is inaccessible."
            )

        # Retrieve all files in the repository, excluding those specified in .gitignore
        all_repository_files = get_files_excluding_gitignore(repo_root)

        # Convert absolute paths to paths relative to the repository root, considering only .py files
        relative_file_paths = [
            str(Path(file).relative_to(repo_root))
            for file in all_repository_files
            if file.endswith(".py")
        ]

        # Generate the repository map
        repo_map_generator = RepoMap(root=repo_root)
        generated_map = repo_map_generator.get_repo_map(
            chat_files=set(request.primary_file_paths),
            other_files=relative_file_paths,
            mentioned_fnames=set(request.files_of_interest),
            mentioned_idents=set(request.mentioned_idents),
        )

        return GetRepoMapResponse(
            repository_map=generated_map,
            error_message=None,
        )
