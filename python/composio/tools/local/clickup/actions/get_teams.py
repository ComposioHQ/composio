import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetTeamsRequest(BaseModel):
    """Request schema for `GetTeams`"""

    team_id: t.Optional[int] = Field(
        default=None,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    group_ids: t.Optional[str] = Field(
        default=None,
        alias="group_ids",
        description=(
            "Enter one or more Team ids (user groups) to retrieve information about specific "
            "Teams. "
        ),
    )


class GetTeamsResponse(BaseModel):
    """Response schema for `GetTeams`"""

    data: t.Dict[str, t.Any]


class GetTeams(OpenAPIAction):
    """
    This endpoint allows viewing user groups (Teams) in a Workspace, where `team_id`
    is the Workspace ID, and `group_id` is a user group ID in API documentation.
    """

    _tags = ["Teams - User Groups"]
    _display_name = "get_teams"
    _request_schema = GetTeamsRequest
    _response_schema = GetTeamsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/group"
    method = "get"
    operation_id = "TeamsUserGroups_getUserGroups"
    action_identifier = "/group_get"

    path_params = {}
    query_params = {"team_id": "team_id", "group_ids": "group_ids"}
    header_params = {}
    request_params = {}

    aliases = {}
