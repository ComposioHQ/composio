import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class AddGuestToFolderRequest(BaseModel):
    """Request schema for `AddGuestToFolder`"""

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
    permission_level: str = Field(
        default=...,
        alias="permission_level",
        description="Can be `read` (view only), `comment`, `edit`, or `create` (full).",
    )


class AddGuestToFolderResponse(BaseModel):
    """Response schema for `AddGuestToFolder`"""

    data: t.Dict[str, t.Any]


class AddGuestToFolder(OpenAPIAction):
    """
    Share a Folder with a guest.    ***Note:** This endpoint is only available
    to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Guests"]
    _display_name = "add_guest_to_folder"
    _request_schema = AddGuestToFolderRequest
    _response_schema = AddGuestToFolderResponse

    url = "https://api.clickup.com/api/v2"
    path = "/folder/{folder_id}/guest/{guest_id}"
    method = "post"
    operation_id = "Guests_addGuestToFolder"
    action_identifier = "/folder/{folder_id}/guest/{guest_id}_post"

    path_params = {"folder_id": "folder_id", "guest_id": "guest_id"}
    query_params = {"include_shared": "include_shared"}
    header_params = {}
    request_params = {"permission_level": {"__alias": "permission_level"}}

    aliases = {}
