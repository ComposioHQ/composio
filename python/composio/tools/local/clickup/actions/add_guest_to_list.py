import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class AddGuestToListRequest(BaseModel):
    """Request schema for `AddGuestToList`"""

    list_id: int = Field(
        ...,
        alias="list_id",
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


class AddGuestToListResponse(BaseModel):
    """Response schema for `AddGuestToList`"""

    data: t.Dict[str, t.Any]


class AddGuestToList(OpenAPIAction):
    """
    Share a List with a guest.    ***Note:** This endpoint is only available
    to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Guests"]
    _display_name = "add_guest_to_list"
    _request_schema = AddGuestToListRequest
    _response_schema = AddGuestToListResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/guest/{guest_id}"
    method = "post"
    operation_id = "Guests_shareListWith"
    action_identifier = "/list/{list_id}/guest/{guest_id}_post"

    path_params = {"list_id": "list_id", "guest_id": "guest_id"}
    query_params = {"include_shared": "include_shared"}
    header_params = {}
    request_params = {"permission_level": {"__alias": "permission_level"}}

    aliases = {}
