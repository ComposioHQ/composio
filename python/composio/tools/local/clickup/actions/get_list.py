import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetListRequest(BaseModel):
    """Request schema for `GetList`"""

    list_id: int = Field(
        ...,
        alias="list_id",
        description="",
    )


class GetListResponse(BaseModel):
    """Response schema for `GetList`"""

    data: t.Dict[str, t.Any]


class GetList(OpenAPIAction):
    """View information about a List."""

    _tags = ["Lists"]
    _display_name = "get_list"
    _request_schema = GetListRequest
    _response_schema = GetListResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}"
    method = "get"
    operation_id = "Lists_getListDetails"
    action_identifier = "/list/{list_id}_get"

    path_params = {"list_id": "list_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
