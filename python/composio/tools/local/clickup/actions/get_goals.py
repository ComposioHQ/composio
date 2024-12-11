import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetGoalsRequest(BaseModel):
    """Request schema for `GetGoals`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    include_completed: t.Optional[bool] = Field(
        default=None,
        alias="include_completed",
        description="",
    )


class GetGoalsResponse(BaseModel):
    """Response schema for `GetGoals`"""

    data: t.Dict[str, t.Any]


class GetGoals(OpenAPIAction):
    """View the Goals available in a Workspace."""

    _tags = ["Goals"]
    _display_name = "get_goals"
    _request_schema = GetGoalsRequest
    _response_schema = GetGoalsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/goal"
    method = "get"
    operation_id = "Goals_getWorkspaceGoals"
    action_identifier = "/team/{team_id}/goal_get"

    path_params = {"team_id": "team_id"}
    query_params = {"include_completed": "include_completed"}
    header_params = {}
    request_params = {}

    aliases = {}
