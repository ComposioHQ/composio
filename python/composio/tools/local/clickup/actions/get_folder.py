import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetFolderRequest(BaseModel):
    """Request schema for `GetFolder`"""

    folder_id: int = Field(
        ...,
        alias="folder_id",
        description="",
    )


class GetFolderResponse(BaseModel):
    """Response schema for `GetFolder`"""

    data: t.Dict[str, t.Any]


class GetFolder(OpenAPIAction):
    """View the Lists within a Folder."""

    _tags = ["Folders"]
    _display_name = "get_folder"
    _request_schema = GetFolderRequest
    _response_schema = GetFolderResponse

    url = "https://api.clickup.com/api/v2"
    path = "/folder/{folder_id}"
    method = "get"
    operation_id = "Folders_getFolderContent"
    action_identifier = "/folder/{folder_id}_get"

    path_params = {"folder_id": "folder_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}


class folders_get_folder_content(OpenAPIAction):
    """View the Lists within a Folder.<<DEPRECATED use get_folder>>"""

    _tags = ["Folders"]
    _display_name = "folders_get_folder_content"
    _request_schema = GetFolderRequest
    _response_schema = GetFolderResponse

    url = "https://api.clickup.com/api/v2"
    path = "/folder/{folder_id}"
    method = "get"
    operation_id = "Folders_getFolderContent"
    action_identifier = "/folder/{folder_id}_get"

    path_params = {"folder_id": "folder_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
