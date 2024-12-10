import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class UpdateTeamRequest(BaseModel):
    """Request schema for `UpdateTeam`"""

    group_id: str = Field(
        ...,
        alias="group_id",
        description="7C73-4002-A6A9-310014852858 (string) - Team ID (user group)",
    )
    name: t.Optional[str] = Field(
        default=None,
        alias="name",
        description="Name",
    )
    handle: t.Optional[str] = Field(
        default=None,
        alias="handle",
        description="Handle",
    )
    members_add: t.List[int] = Field(
        default=...,
        alias="members__add",
        description="",
    )
    members_rem: t.List[int] = Field(
        default=...,
        alias="members__rem",
        description="",
    )


class UpdateTeamResponse(BaseModel):
    """Response schema for `UpdateTeam`"""

    data: t.Dict[str, t.Any]


class UpdateTeam(OpenAPIAction):
    """
    The endpoint controls user group assignments in a Workspace, requiring 'team_id'
    and 'group_id'. Adding a view-only guest as a paid member incurs prorated
    charges for additional seats.
    """

    _tags = ["Teams - User Groups"]
    _display_name = "update_team"
    _request_schema = UpdateTeamRequest
    _response_schema = UpdateTeamResponse

    url = "https://api.clickup.com/api/v2"
    path = "/group/{group_id}"
    method = "put"
    operation_id = "TeamsUserGroups_updateUserGroup"
    action_identifier = "/group/{group_id}_put"

    path_params = {"group_id": "group_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "name": {"__alias": "name"},
        "handle": {"__alias": "handle"},
        "members": {
            "__alias": "members",
            "add": {"__alias": "add"},
            "rem": {"__alias": "rem"},
        },
    }

    aliases = {"members": "3b810d6a"}
