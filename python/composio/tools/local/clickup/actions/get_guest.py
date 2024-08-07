import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetGuestRequest(BaseModel):
    """Request schema for `GetGuest`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    guest_id: int = Field(
        ...,
        alias="guest_id",
        description="",
    )


class GetGuestResponse(BaseModel):
    """Response schema for `GetGuest`"""

    data: t.Dict[str, t.Any]


class GetGuest(OpenAPIAction):
    """
    View information about a guest.    ***Note:** This endpoint is only available
    to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Guests"]
    _display_name = "get_guest"
    _request_schema = GetGuestRequest
    _response_schema = GetGuestResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/guest/{guest_id}"
    method = "get"
    operation_id = "Guests_getGuestInformation"
    action_identifier = "/team/{team_id}/guest/{guest_id}_get"

    path_params = {"team_id": "team_id", "guest_id": "guest_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
