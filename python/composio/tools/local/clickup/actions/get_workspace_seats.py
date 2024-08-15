import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetWorkspaceSeatsRequest(BaseModel):
    """Request schema for `GetWorkspaceSeats`"""

    team_id: str = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )


class GetWorkspaceSeatsResponse(BaseModel):
    """Response schema for `GetWorkspaceSeats`"""

    data: t.Dict[str, t.Any]


class GetWorkspaceSeats(OpenAPIAction):
    """
    View the used, total, and available member and guest seats for a Workspace.
    """

    _tags = ["Teams - Workspaces"]
    _display_name = "get_workspace_seats"
    _request_schema = GetWorkspaceSeatsRequest
    _response_schema = GetWorkspaceSeatsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/seats"
    method = "get"
    operation_id = "TeamsWorkspaces_getWorkspaceSeats"
    action_identifier = "/team/{team_id}/seats_get"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}


class teams_work_spaces_get_work_space_seats(OpenAPIAction):
    """
    View the used, total, and available member and guest seats for a Workspace.<<DEPRECATED
    use get_workspace_seats>>
    """

    _tags = ["Teams - Workspaces"]
    _display_name = "teams_work_spaces_get_work_space_seats"
    _request_schema = GetWorkspaceSeatsRequest
    _response_schema = GetWorkspaceSeatsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/seats"
    method = "get"
    operation_id = "TeamsWorkspaces_getWorkspaceSeats"
    action_identifier = "/team/{team_id}/seats_get"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
