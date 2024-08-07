import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class UpdateFolderRequest(BaseModel):
    """Request schema for `UpdateFolder`"""

    folder_id: int = Field(
        ...,
        alias="folder_id",
        description="",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )


class UpdateFolderResponse(BaseModel):
    """Response schema for `UpdateFolder`"""

    data: t.Dict[str, t.Any]


class UpdateFolder(OpenAPIAction):
    """Rename a Folder."""

    _tags = ["Folders"]
    _display_name = "update_folder"
    _request_schema = UpdateFolderRequest
    _response_schema = UpdateFolderResponse

    url = "https://api.clickup.com/api/v2"
    path = "/folder/{folder_id}"
    method = "put"
    operation_id = "Folders_renameFolder"
    action_identifier = "/folder/{folder_id}_put"

    path_params = {"folder_id": "folder_id"}
    query_params = {}
    header_params = {}
    request_params = {"name": {"__alias": "name"}}

    aliases = {}
