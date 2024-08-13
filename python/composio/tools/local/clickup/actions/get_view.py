import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetViewRequest(BaseModel):
    """Request schema for `GetView`"""

    view_id: str = Field(
        ...,
        alias="view_id",
        description="",
    )


class GetViewResponse(BaseModel):
    """Response schema for `GetView`"""

    data: t.Dict[str, t.Any]


class GetView(OpenAPIAction):
    """View information about a specific task or page view."""

    _tags = ["Views"]
    _display_name = "get_view"
    _request_schema = GetViewRequest
    _response_schema = GetViewResponse

    url = "https://api.clickup.com/api/v2"
    path = "/view/{view_id}"
    method = "get"
    operation_id = "Views_getViewInfo"
    action_identifier = "/view/{view_id}_get"

    path_params = {"view_id": "view_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
