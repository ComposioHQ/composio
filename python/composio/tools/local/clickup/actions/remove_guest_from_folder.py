import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class RemoveGuestFromFolderRequest(BaseModel):
    """Request schema for `RemoveGuestFromFolder`"""

    folder_id: int = Field(
        ...,
        alias="folder_id",
        description="",
    )
    guest_id: int = Field(
        ...,
        alias="guest_id",
        description="",
    )
    include_shared: t.Optional[bool] = Field(
        default=None,
        alias="include_shared",
        description=(
            "Exclude details of items shared with the guest by setting this parameter "
            "to `false`. By default this parameter is set to `true`. "
        ),
    )


class RemoveGuestFromFolderResponse(BaseModel):
    """Response schema for `RemoveGuestFromFolder`"""

    data: t.Dict[str, t.Any]


class RemoveGuestFromFolder(OpenAPIAction):
    """
    Revoke a guest's access to a Folder.    ***Note:** This endpoint is only
    available to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Guests"]
    _display_name = "remove_guest_from_folder"
    _request_schema = RemoveGuestFromFolderRequest
    _response_schema = RemoveGuestFromFolderResponse

    url = "https://api.clickup.com/api/v2"
    path = "/folder/{folder_id}/guest/{guest_id}"
    method = "delete"
    operation_id = "Guests_revokeAccessFromFolder"
    action_identifier = "/folder/{folder_id}/guest/{guest_id}_delete"

    path_params = {"folder_id": "folder_id", "guest_id": "guest_id"}
    query_params = {"include_shared": "include_shared"}
    header_params = {}
    request_params = {}

    aliases = {}
