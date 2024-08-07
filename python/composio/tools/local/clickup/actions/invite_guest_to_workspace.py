import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class InviteGuestToWorkspaceRequest(BaseModel):
    """Request schema for `InviteGuestToWorkspace`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    email: str = Field(
        default=...,
        alias="email",
        description="Email",
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


class InviteGuestToWorkspaceResponse(BaseModel):
    """Response schema for `InviteGuestToWorkspace`"""

    data: t.Dict[str, t.Any]


class InviteGuestToWorkspace(OpenAPIAction):
    """
    To invite a guest to your Workspace, use the "Invite User to Workspace"
    endpoint. Then, use specific endpoints to grant access to folders, lists,
    or tasks. Note: Available only for Enterprise Plan.
    """

    _tags = ["Guests"]
    _display_name = "invite_guest_to_workspace"
    _request_schema = InviteGuestToWorkspaceRequest
    _response_schema = InviteGuestToWorkspaceResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/guest"
    method = "post"
    operation_id = "Guests_inviteToWorkspace"
    action_identifier = "/team/{team_id}/guest_post"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "email": {"__alias": "email"},
        "can_edit_tags": {"__alias": "can_edit_tags"},
        "can_see_time_spent": {"__alias": "can_see_time_spent"},
        "can_see_time_estimated": {"__alias": "can_see_time_estimated"},
        "can_create_views": {"__alias": "can_create_views"},
        "custom_role_id": {"__alias": "custom_role_id"},
    }

    aliases = {}
