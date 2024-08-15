import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class RemoveGuestFromWorkspaceRequest(BaseModel):
    """Request schema for `RemoveGuestFromWorkspace`"""

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


class RemoveGuestFromWorkspaceResponse(BaseModel):
    """Response schema for `RemoveGuestFromWorkspace`"""

    data: t.Dict[str, t.Any]


class RemoveGuestFromWorkspace(OpenAPIAction):
    """
    Revoke a guest's access to a Workspace.    ***Note:** This endpoint is only
    available to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Guests"]
    _display_name = "remove_guest_from_workspace"
    _request_schema = RemoveGuestFromWorkspaceRequest
    _response_schema = RemoveGuestFromWorkspaceResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/guest/{guest_id}"
    method = "delete"
    operation_id = "Guests_revokeGuestAccessToWorkspace"
    action_identifier = "/team/{team_id}/guest/{guest_id}_delete"

    path_params = {"team_id": "team_id", "guest_id": "guest_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
