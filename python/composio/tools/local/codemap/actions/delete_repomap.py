from pathlib import Path
from typing import Dict, Optional

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.base.utils.repomap import RepoMap


class DeleteRepoMapRequest(BaseModel):
    root_path: str = Field(..., description="Root directory path of the repository")


class DeleteRepoMapResponse(BaseModel):
    success: bool = Field(..., description="Whether the deletion was successful")
    message: Optional[str] = Field(default=None, description="Error message if any")


class DeleteRepoMap(LocalAction[DeleteRepoMapRequest, DeleteRepoMapResponse]):
    """
    Deletes the repository map cache for the given root directory. This action removes the cached data used by RepoMap.
    """

    _tags = ["repo"]

    def execute(
        self, request: DeleteRepoMapRequest, metadata: Dict
    ) -> DeleteRepoMapResponse:
        root_path = Path(request.root_path).resolve()
        if not root_path.exists():
            return DeleteRepoMapResponse(
                success=False,
                message=f"Path {root_path} does not exist",
            )

        repo_map = RepoMap(root=root_path)
        repo_map.delete_cache()
        return DeleteRepoMapResponse(
            success=True,
            message="Repository map cache deleted successfully",
        )
