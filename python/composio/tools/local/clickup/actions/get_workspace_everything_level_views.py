import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetWorkspaceEverythingLevelViewsRequest(BaseModel):
    """Request schema for `GetWorkspaceEverythingLevelViews`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )


class GetWorkspaceEverythingLevelViewsResponse(BaseModel):
    """Response schema for `GetWorkspaceEverythingLevelViews`"""

    data: t.Dict[str, t.Any]


class GetWorkspaceEverythingLevelViews(OpenAPIAction):
    """
    View the task and page views available at the Everything Level of a Workspace.
    """

    _tags = ["Views"]
    _display_name = "get_workspace_everything_level_views"
    _request_schema = GetWorkspaceEverythingLevelViewsRequest
    _response_schema = GetWorkspaceEverythingLevelViewsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/view"
    method = "get"
    operation_id = "Views_getEverythingLevel"
    action_identifier = "/team/{team_id}/view_get"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}


class views_get_everything_level(OpenAPIAction):
    """
    View the task and page views available at the Everything Level of a Workspace.<<DEPRECATED
    use get_workspace_everything_level_views>>
    """

    _tags = ["Views"]
    _display_name = "views_get_everything_level"
    _request_schema = GetWorkspaceEverythingLevelViewsRequest
    _response_schema = GetWorkspaceEverythingLevelViewsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/view"
    method = "get"
    operation_id = "Views_getEverythingLevel"
    action_identifier = "/team/{team_id}/view_get"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
