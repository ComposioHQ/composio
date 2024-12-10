import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetListsRequest(BaseModel):
    """Request schema for `GetLists`"""

    folder_id: int = Field(
        ...,
        alias="folder_id",
        description="",
    )
    archived: t.Optional[bool] = Field(
        default=None,
        alias="archived",
        description="",
    )


class GetListsResponse(BaseModel):
    """Response schema for `GetLists`"""

    data: t.Dict[str, t.Any]


class GetLists(OpenAPIAction):
    """View the Lists within a Folder."""

    _tags = ["Lists"]
    _display_name = "get_lists"
    _request_schema = GetListsRequest
    _response_schema = GetListsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/folder/{folder_id}/list"
    method = "get"
    operation_id = "Lists_getFolderLists"
    action_identifier = "/folder/{folder_id}/list_get"

    path_params = {"folder_id": "folder_id"}
    query_params = {"archived": "archived"}
    header_params = {}
    request_params = {}

    aliases = {}


class lists_get_folder_lists(OpenAPIAction):
    """View the Lists within a Folder.<<DEPRECATED use get_lists>>"""

    _tags = ["Lists"]
    _display_name = "lists_get_folder_lists"
    _request_schema = GetListsRequest
    _response_schema = GetListsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/folder/{folder_id}/list"
    method = "get"
    operation_id = "Lists_getFolderLists"
    action_identifier = "/folder/{folder_id}/list_get"

    path_params = {"folder_id": "folder_id"}
    query_params = {"archived": "archived"}
    header_params = {}
    request_params = {}

    aliases = {}
