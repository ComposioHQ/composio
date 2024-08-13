import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetFolderViewsRequest(BaseModel):
    """Request schema for `GetFolderViews`"""

    folder_id: int = Field(
        ...,
        alias="folder_id",
        description="",
    )


class GetFolderViewsResponse(BaseModel):
    """Response schema for `GetFolderViews`"""

    data: t.Dict[str, t.Any]


class GetFolderViews(OpenAPIAction):
    """View the task and page views available for a Folder."""

    _tags = ["Views"]
    _display_name = "get_folder_views"
    _request_schema = GetFolderViewsRequest
    _response_schema = GetFolderViewsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/folder/{folder_id}/view"
    method = "get"
    operation_id = "Views_folderViewsGet"
    action_identifier = "/folder/{folder_id}/view_get"

    path_params = {"folder_id": "folder_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
