import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetFoldersRequest(BaseModel):
    """Request schema for `GetFolders`"""

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


class GetFoldersResponse(BaseModel):
    """Response schema for `GetFolders`"""

    data: t.Dict[str, t.Any]


class GetFolders(OpenAPIAction):
    """View the Folders in a Space."""

    _tags = ["Folders"]
    _display_name = "get_folders"
    _request_schema = GetFoldersRequest
    _response_schema = GetFoldersResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/folder"
    method = "get"
    operation_id = "Folders_getContentsOf"
    action_identifier = "/space/{space_id}/folder_get"

    path_params = {"space_id": "space_id"}
    query_params = {"archived": "archived"}
    header_params = {}
    request_params = {}

    aliases = {}


class folders_get_contents_of(OpenAPIAction):
    """View the Folders in a Space.<<DEPRECATED use get_folders>>"""

    _tags = ["Folders"]
    _display_name = "folders_get_contents_of"
    _request_schema = GetFoldersRequest
    _response_schema = GetFoldersResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/folder"
    method = "get"
    operation_id = "Folders_getContentsOf"
    action_identifier = "/space/{space_id}/folder_get"

    path_params = {"space_id": "space_id"}
    query_params = {"archived": "archived"}
    header_params = {}
    request_params = {}

    aliases = {}
