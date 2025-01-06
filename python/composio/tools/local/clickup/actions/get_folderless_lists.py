import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetFolderlessListsRequest(BaseModel):
    """Request schema for `GetFolderlessLists`"""

    space_id: int = Field(
        ...,
        alias="space_id",
        description="",
    )
    archived: t.Optional[bool] = Field(
        default=None,
        alias="archived",
        description="",
    )


class GetFolderlessListsResponse(BaseModel):
    """Response schema for `GetFolderlessLists`"""

    data: t.Dict[str, t.Any]


class GetFolderlessLists(OpenAPIAction):
    """View the Lists in a Space that aren't located in a Folder."""

    _tags = ["Lists"]
    _display_name = "get_folderless_lists"
    _request_schema = GetFolderlessListsRequest
    _response_schema = GetFolderlessListsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/list"
    method = "get"
    operation_id = "Lists_getFolderless"
    action_identifier = "/space/{space_id}/list_get"

    path_params = {"space_id": "space_id"}
    query_params = {"archived": "archived"}
    header_params = {}
    request_params = {}

    aliases = {}
