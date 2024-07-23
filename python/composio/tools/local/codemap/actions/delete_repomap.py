from pathlib import Path
from typing import Optional, Type

from pydantic import BaseModel, Field

from composio.tools.local.base import Action
from composio.tools.local.base.utils.repomap import RepoMap


class DeleteRepoMapRequest(BaseModel):
    root_path: str = Field(..., description="Root directory path of the repository")


class DeleteRepoMapResponse(BaseModel):
    success: bool = Field(..., description="Whether the deletion was successful")
    error: Optional[str] = Field(default=None, description="Error message if any")


class DeleteRepoMap(Action[DeleteRepoMapRequest, DeleteRepoMapResponse]):
    """
    Deletes the repository map cache for the given root directory. This action removes the cached data used by RepoMap.
    """

    _display_name = "Delete Repository Map Cache"
    _request_schema: Type[DeleteRepoMapRequest] = DeleteRepoMapRequest
    _response_schema: Type[DeleteRepoMapResponse] = DeleteRepoMapResponse
    _tags = ["repo"]
    _tool_name = "codemap"

    def execute(
        self, request_data: DeleteRepoMapRequest, authorisation_data: dict = {}
    ) -> dict:
        root_path = Path(request_data.root_path).resolve()
        if not root_path.exists():
            return {"success": False, "error": f"Path {root_path} does not exist"}

        try:
            repo_map = RepoMap(root=root_path)
            repo_map.delete_cache()

            return {
                "success": True,
                "message": "Repository map cache deleted successfully",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"An error occurred while deleting the repository map cache: {str(e)}",
            }
