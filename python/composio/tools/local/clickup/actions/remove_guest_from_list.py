import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class RemoveGuestFromListRequest(BaseModel):
    """Request schema for `RemoveGuestFromList`"""

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


class RemoveGuestFromListResponse(BaseModel):
    """Response schema for `RemoveGuestFromList`"""

    data: t.Dict[str, t.Any]


class RemoveGuestFromList(OpenAPIAction):
    """
    Revoke a guest's access to a List.   ***Note:** This endpoint is only available
    to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Guests"]
    _display_name = "remove_guest_from_list"
    _request_schema = RemoveGuestFromListRequest
    _response_schema = RemoveGuestFromListResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/guest/{guest_id}"
    method = "delete"
    operation_id = "Guests_removeFromList"
    action_identifier = "/list/{list_id}/guest/{guest_id}_delete"

    path_params = {"list_id": "list_id", "guest_id": "guest_id"}
    query_params = {"include_shared": "include_shared"}
    header_params = {}
    request_params = {}

    aliases = {}
