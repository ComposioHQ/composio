from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.base.utils.grep_utils import get_files_excluding_gitignore
from composio.tools.local.base.utils.repomap import RepoMap


class GenerateRankedTagsRequest(BaseModel):
    code_directory: str = Field(
        ...,
        description="Absolute path to the root directory of the code or repository or codebase.",
        examples=[
            "/home/user/projects/my-repo",
            "C:\\Users\\user\\Documents\\GitHub\\project",
            "/project",
        ],
    )
    files_of_interest: List[str] = Field(
        default=[],
        description="List of file paths (relative to the repository root) for which to generate ranked tags",
        examples=[
            ["src/main.py", "tests/test_utils.py"],
            ["lib/core.js", "lib/helpers.js", "src/index.js"],
        ],
    )


class GenerateRankedTagsResponse(BaseModel):
    ranked_tags: str = Field(
        ...,
        description="List of ranked tags for the specified files, ordered by importance",
    )
    error: Optional[str] = Field(
        default=None,
        description="Error message if any issues occurred during tag generation",
    )


class GenerateRankedTags(
    LocalAction[GenerateRankedTagsRequest, GenerateRankedTagsResponse]
):
    """
    Generates ranked tags for specified files of interest within a repository.

    This action analyzes the repository structure and content to produce a list of
    important code elements (tags) from the specified files, ranked by their
    significance within the codebase.

    Use cases:
    1. Quickly understand the structure and key components of specific files
    2. Identify important functions, classes, or variables in files of interest
    3. Assist in code navigation and comprehension for large codebases

    Example usage:
    ```python
    request =  repository_root="/path/to/repo",
        files_of_interest=["src/main.py", "src/utils.py"]
    )
    result = GenerateRankedTags().execute(request)

    if result.error:
        print(f"Error: {result.error}")
    else:
        for tag in result.ranked_tags:
            print(f"{tag.file_path}:{tag.line_number} - {tag.tag_content}")
    ```
    """

    display_name = "Generate Ranked Tags"
    _tags = ["repo", "tags", "code-analysis"]

    def execute(
        self,
        request: GenerateRankedTagsRequest,
        metadata: dict,
    ) -> GenerateRankedTagsResponse:
        repo_root = Path(request.code_directory).resolve()
        if not repo_root.exists():
            print(f"Error: Repository root path {repo_root} does not exist")
            return GenerateRankedTagsResponse(
                ranked_tags="", error=f"Repository root path {repo_root} does not exist"
            )

        # Get all files in the repository, excluding those in .gitignore
        all_files = get_files_excluding_gitignore(
            root_path=repo_root, no_gitignore=False
        )

        # Convert absolute paths to relative paths, only for .py files
        all_files = [
            str(Path(file).relative_to(repo_root))
            for file in all_files
            if file.endswith(".py")
        ]

        # Generate ranked tags map
        repo_map = RepoMap(root=repo_root)
        ranked_tags_map = repo_map.get_ranked_tags_map(
            chat_fnames=[],
            other_fnames=all_files,
            mentioned_fnames=set(request.files_of_interest),
            mentioned_idents=set(),
        )

        # Parse the ranked_tags_map string to extract RankedTag objects
        if ranked_tags_map is None:
            print("Error: No ranked tags map generated")
            return GenerateRankedTagsResponse(
                ranked_tags="",
                error="No ranked tags map generated",
            )
        return GenerateRankedTagsResponse(
            ranked_tags=ranked_tags_map,
        )
