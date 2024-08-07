import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateTeamRequest(BaseModel):
    """Request schema for `CreateTeam`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )
    members: t.List[int] = Field(
        default=...,
        alias="members",
        description="",
    )


class CreateTeamResponse(BaseModel):
    """Response schema for `CreateTeam`"""

    data: t.Dict[str, t.Any]


class CreateTeam(OpenAPIAction):
    """
    The endpoint allows creating Teams within Workspaces, assigning tasks, and
    managing IDs for both. Adding a view-only guest as a paid member may result
    in extra charges due to automatic seat addition.
    """

    _tags = ["Teams - User Groups"]
    _display_name = "create_team"
    _request_schema = CreateTeamRequest
    _response_schema = CreateTeamResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/group"
    method = "post"
    operation_id = "TeamsUserGroups_createTeam"
    action_identifier = "/team/{team_id}/group_post"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {"name": {"__alias": "name"}, "members": {"__alias": "members"}}

    aliases = {}


class teams_user_groups_create_team(OpenAPIAction):
    """
    The endpoint allows creating Teams within Workspaces, assigning tasks, and
    managing IDs for both. Adding a view-only guest as a paid member may result
    in extra charges due to automatic seat addition.<<DEPRECATED use create_team>>
    """

    _tags = ["Teams - User Groups"]
    _display_name = "teams_user_groups_create_team"
    _request_schema = CreateTeamRequest
    _response_schema = CreateTeamResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/group"
    method = "post"
    operation_id = "TeamsUserGroups_createTeam"
    action_identifier = "/team/{team_id}/group_post"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {"name": {"__alias": "name"}, "members": {"__alias": "members"}}

    aliases = {}
