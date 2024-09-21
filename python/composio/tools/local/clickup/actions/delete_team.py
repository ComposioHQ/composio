import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteTeamRequest(BaseModel):
    """Request schema for `DeleteTeam`"""

    group_id: str = Field(
        ...,
        alias="group_id",
        description="7C73-4002-A6A9-310014852858 (string) - Team ID (user group)",
    )


class DeleteTeamResponse(BaseModel):
    """Response schema for `DeleteTeam`"""

    data: t.Dict[str, t.Any]


class DeleteTeam(OpenAPIAction):
    """
    This endpoint removes a user group from a Workspace, per ClickUp documentation.
    `team_id` is the Workspace id, and `group_id` is the user group id.
    """

    _tags = ["Teams - User Groups"]
    _display_name = "delete_team"
    _request_schema = DeleteTeamRequest
    _response_schema = DeleteTeamResponse

    url = "https://api.clickup.com/api/v2"
    path = "/group/{group_id}"
    method = "delete"
    operation_id = "TeamsUserGroups_removeGroup"
    action_identifier = "/group/{group_id}_delete"

    path_params = {"group_id": "group_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
