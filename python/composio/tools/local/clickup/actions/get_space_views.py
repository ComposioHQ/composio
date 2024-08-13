import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetSpaceViewsRequest(BaseModel):
    """Request schema for `GetSpaceViews`"""

    space_id: int = Field(
        ...,
        alias="space_id",
        description="",
    )


class GetSpaceViewsResponse(BaseModel):
    """Response schema for `GetSpaceViews`"""

    data: t.Dict[str, t.Any]


class GetSpaceViews(OpenAPIAction):
    """View the task and page views available for a Space."""

    _tags = ["Views"]
    _display_name = "get_space_views"
    _request_schema = GetSpaceViewsRequest
    _response_schema = GetSpaceViewsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/view"
    method = "get"
    operation_id = "Views_spaceViewsGet"
    action_identifier = "/space/{space_id}/view_get"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}


class views_space_views_get(OpenAPIAction):
    """
    View the task and page views available for a Space.<<DEPRECATED use get_space_views>>
    """

    _tags = ["Views"]
    _display_name = "views_space_views_get"
    _request_schema = GetSpaceViewsRequest
    _response_schema = GetSpaceViewsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/view"
    method = "get"
    operation_id = "Views_spaceViewsGet"
    action_identifier = "/space/{space_id}/view_get"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
