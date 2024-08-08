import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetListViewsRequest(BaseModel):
    """Request schema for `GetListViews`"""

    list_id: int = Field(
        ...,
        alias="list_id",
        description="",
    )


class GetListViewsResponse(BaseModel):
    """Response schema for `GetListViews`"""

    data: t.Dict[str, t.Any]


class GetListViews(OpenAPIAction):
    """
    View the task and page views available for a List.<br> Views and required
    views are separate responses.
    """

    _tags = ["Views"]
    _display_name = "get_list_views"
    _request_schema = GetListViewsRequest
    _response_schema = GetListViewsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/view"
    method = "get"
    operation_id = "Views_getListViews"
    action_identifier = "/list/{list_id}/view_get"

    path_params = {"list_id": "list_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
