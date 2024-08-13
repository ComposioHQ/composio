import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteListRequest(BaseModel):
    """Request schema for `DeleteList`"""

    list_id: int = Field(
        ...,
        alias="list_id",
        description="",
    )


class DeleteListResponse(BaseModel):
    """Response schema for `DeleteList`"""

    data: t.Dict[str, t.Any]


class DeleteList(OpenAPIAction):
    """Delete a List from your Workspace."""

    _tags = ["Lists"]
    _display_name = "delete_list"
    _request_schema = DeleteListRequest
    _response_schema = DeleteListResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}"
    method = "delete"
    operation_id = "Lists_removeList"
    action_identifier = "/list/{list_id}_delete"

    path_params = {"list_id": "list_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
