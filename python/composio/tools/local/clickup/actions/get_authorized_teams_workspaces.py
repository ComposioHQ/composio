import typing as t

from pydantic import BaseModel

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetAuthorizedTeamsWorkspacesRequest(BaseModel):
    """Request schema for `GetAuthorizedTeamsWorkspaces`"""


class GetAuthorizedTeamsWorkspacesResponse(BaseModel):
    """Response schema for `GetAuthorizedTeamsWorkspaces`"""

    data: t.Dict[str, t.Any]


class GetAuthorizedTeamsWorkspaces(OpenAPIAction):
    """View the Workspaces available to the authenticated user."""

    _tags = ["Authorization", "Teams - Workspaces"]
    _display_name = "get_authorized_teams_workspaces"
    _request_schema = GetAuthorizedTeamsWorkspacesRequest
    _response_schema = GetAuthorizedTeamsWorkspacesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team"
    method = "get"
    operation_id = "Authorization_getWorkspaceList"
    action_identifier = "/team_get"

    path_params = {}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}


class authorization_get_work_space_list(OpenAPIAction):
    """
    View the Workspaces available to the authenticated user.<<DEPRECATED use
    get_authorized_teams_workspaces>>
    """

    _tags = ["Authorization", "Teams - Workspaces"]
    _display_name = "authorization_get_work_space_list"
    _request_schema = GetAuthorizedTeamsWorkspacesRequest
    _response_schema = GetAuthorizedTeamsWorkspacesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team"
    method = "get"
    operation_id = "Authorization_getWorkspaceList"
    action_identifier = "/team_get"

    path_params = {}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
