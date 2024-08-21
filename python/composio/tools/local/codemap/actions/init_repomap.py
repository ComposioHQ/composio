from pathlib import Path

from pydantic import BaseModel, Field

from composio.tools.base.exceptions import ExecutionFailed
from composio.tools.base.local import LocalAction
from composio.tools.local.base.utils.grep_utils import get_files_excluding_gitignore
from composio.tools.local.base.utils.repomap import RepoMap


class InitRepoMapRequest(BaseModel):
    code_directory: str = Field(
        ..., description="Root directory path to initialize the repository map"
    )


class InitRepoMapResponse(BaseModel):
    success: bool = Field(..., description="Whether the initialization was successful")
    message: str = Field(default=None, description="Message if any")


class InitRepoMap(LocalAction[InitRepoMapRequest, InitRepoMapResponse]):
    """
    Initializes the repository map for the given root directory.
    """

    _tags = ["repo"]

    def execute(
        self,
        request: InitRepoMapRequest,
        metadata: dict,
    ) -> InitRepoMapResponse:
        root_path = Path(request.code_directory).resolve()
        if not root_path.exists():
            raise ExecutionFailed(
                message=f"Path {root_path} does not exist",
                suggestion="Try providing path that exists",
            )

        repo_tree = RepoMap(root=root_path)

        # Get all files in the repository, excluding those in .gitignore
        all_files = get_files_excluding_gitignore(root_path)

        # Convert absolute paths to relative paths
        all_files = [str(Path(file).relative_to(root_path)) for file in all_files]

        # Build cache by creating a repo tree for all files
        repo_tree.get_repo_map(
            chat_files=[],
            other_files=all_files,
            mentioned_fnames=set(),
            mentioned_idents=set(),
        )

        return InitRepoMapResponse(
            success=True,
            message="Repository map initialized successfully",
        )
