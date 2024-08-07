import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateFolderRequest(BaseModel):
    """Request schema for `CreateFolder`"""

    space_id: int = Field(
        ...,
        alias="space_id",
        description="",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )


class CreateFolderResponse(BaseModel):
    """Response schema for `CreateFolder`"""

    data: t.Dict[str, t.Any]


class CreateFolder(OpenAPIAction):
    """Add a new Folder to a Space."""

    _tags = ["Folders"]
    _display_name = "create_folder"
    _request_schema = CreateFolderRequest
    _response_schema = CreateFolderResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/folder"
    method = "post"
    operation_id = "Folders_createNewFolder"
    action_identifier = "/space/{space_id}/folder_post"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {"name": {"__alias": "name"}}

    aliases = {}


class folders_create_new_folder(OpenAPIAction):
    """Add a new Folder to a Space.<<DEPRECATED use create_folder>>"""

    _tags = ["Folders"]
    _display_name = "folders_create_new_folder"
    _request_schema = CreateFolderRequest
    _response_schema = CreateFolderResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/folder"
    method = "post"
    operation_id = "Folders_createNewFolder"
    action_identifier = "/space/{space_id}/folder_post"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {"name": {"__alias": "name"}}

    aliases = {}
