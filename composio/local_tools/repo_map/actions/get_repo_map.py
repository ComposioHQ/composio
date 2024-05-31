from pydantic import Field, BaseModel
from typing import Dict, Any

from composio.local_tools.action import Action
from composio.local_tools.local_workspace.commons.get_logger import get_logger


STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"
logger = get_logger()


class GetRepoMapRequest(BaseModel):
    repo_name: str = Field(
        ..., description="repo-name for which repo-map is needed"
    )


class GetRepoMapResponse(BaseModel):
    repo_map: Dict[str, Any] = Field(
        ..., description="repo-map for the repo"
    )


class GetRepoMap(Action):
    """
    Returns the status of workspace given in the request
    """

    _display_name = "Get repo-map for the repo"
    _request_schema = GetRepoMapRequest
    _response_schema = GetRepoMapResponse

    def execute(
        self, request_data: GetRepoMapRequest, authorisation_data: dict = {}
    ):
        pass
