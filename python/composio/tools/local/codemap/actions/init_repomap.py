from pathlib import Path
from typing import Type

from pydantic import BaseModel, Field

from composio.tools.local.base import Action
from composio.tools.local.base.utils.grep_utils import get_files_excluding_gitignore
from composio.tools.local.base.utils.repomap import RepoMap


class InitRepoMapRequest(BaseModel):
    code_directory: str = Field(
        ..., description="Root directory path to initialize the repository map"
    )


class InitRepoMapResponse(BaseModel):
    success: bool = Field(..., description="Whether the initialization was successful")
    error: str = Field(default=None, description="Error message if any")


class InitRepoMap(Action[InitRepoMapRequest, InitRepoMapResponse]):
    """
    Initializes the repository map for the given root directory.
    """

    _display_name = "Initialize Repository Map"
    _request_schema: Type[InitRepoMapRequest] = InitRepoMapRequest
    _response_schema: Type[InitRepoMapResponse] = InitRepoMapResponse
    _tags = ["repo"]
    _tool_name = "codemap"

    def execute(
        self, request_data: InitRepoMapRequest, authorisation_data: dict = {}
    ) -> dict:
        root_path = Path(request_data.code_directory).resolve()
        if not root_path.exists():
            return {"success": False, "error": f"Path {root_path} does not exist"}

        try:
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

            return {
                "success": True,
                "message": "Repository map initialized successfully",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"An error occurred while initializing the repository map: {str(e)}",
            }
