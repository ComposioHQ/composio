import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class EditGuestOnWorkspaceRequest(BaseModel):
    """Request schema for `EditGuestOnWorkspace`"""

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
    username: str = Field(
        default=...,
        alias="username",
        description="Username",
    )
    can_edit_tags: bool = Field(
        default=...,
        alias="can_edit_tags",
        description="Can Edit Tags",
    )
    can_see_time_spent: bool = Field(
        default=...,
        alias="can_see_time_spent",
        description="Can See Time Spent",
    )
    can_see_time_estimated: bool = Field(
        default=...,
        alias="can_see_time_estimated",
        description="Can See Time Estimated",
    )
    can_create_views: bool = Field(
        default=...,
        alias="can_create_views",
        description="Can Create Views",
    )
    custom_role_id: int = Field(
        default=...,
        alias="custom_role_id",
        description="Custom Role Id",
    )


class EditGuestOnWorkspaceResponse(BaseModel):
    """Response schema for `EditGuestOnWorkspace`"""

    data: t.Dict[str, t.Any]


class EditGuestOnWorkspace(OpenAPIAction):
    """
    Rename and configure options for a guest.    ***Note:** This endpoint is
    only available to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Guests"]
    _display_name = "edit_guest_on_workspace"
    _request_schema = EditGuestOnWorkspaceRequest
    _response_schema = EditGuestOnWorkspaceResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/guest/{guest_id}"
    method = "put"
    operation_id = "Guests_editGuestOnWorkspace"
    action_identifier = "/team/{team_id}/guest/{guest_id}_put"

    path_params = {"team_id": "team_id", "guest_id": "guest_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "username": {"__alias": "username"},
        "can_edit_tags": {"__alias": "can_edit_tags"},
        "can_see_time_spent": {"__alias": "can_see_time_spent"},
        "can_see_time_estimated": {"__alias": "can_see_time_estimated"},
        "can_create_views": {"__alias": "can_create_views"},
        "custom_role_id": {"__alias": "custom_role_id"},
    }

    aliases = {}
