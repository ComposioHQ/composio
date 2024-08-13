import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteFolderRequest(BaseModel):
    """Request schema for `DeleteFolder`"""

    folder_id: int = Field(
        ...,
        alias="folder_id",
        description="",
    )


class DeleteFolderResponse(BaseModel):
    """Response schema for `DeleteFolder`"""

    data: t.Dict[str, t.Any]


class DeleteFolder(OpenAPIAction):
    """Delete a Folder from your Workspace."""

    _tags = ["Folders"]
    _display_name = "delete_folder"
    _request_schema = DeleteFolderRequest
    _response_schema = DeleteFolderResponse

    url = "https://api.clickup.com/api/v2"
    path = "/folder/{folder_id}"
    method = "delete"
    operation_id = "Folders_removeFolder"
    action_identifier = "/folder/{folder_id}_delete"

    path_params = {"folder_id": "folder_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
