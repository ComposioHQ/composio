import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class AddGuestToTaskRequest(BaseModel):
    """Request schema for `AddGuestToTask`"""

    task_id: str = Field(
        ...,
        alias="task_id",
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
    custom_task_ids: t.Optional[bool] = Field(
        default=None,
        alias="custom_task_ids",
        description=(
            'If you want to reference a task by it"s custom task id, this value must '
            "be `true`. "
        ),
    )
    team_id: t.Optional[int] = Field(
        default=None,
        alias="team_id",
        description=(
            "Only used when the `custom_task_ids` parameter is set to `true`.   For example: "
            "`custom_task_ids=true&team_id=123`. "
        ),
    )
    permission_level: str = Field(
        default=...,
        alias="permission_level",
        description="Can be `read` (view only), `comment`, `edit`, or `create` (full).",
    )


class AddGuestToTaskResponse(BaseModel):
    """Response schema for `AddGuestToTask`"""

    data: t.Dict[str, t.Any]


class AddGuestToTask(OpenAPIAction):
    """
    Share a task with a guest.    ***Note:** This endpoint is only available
    to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Guests"]
    _display_name = "add_guest_to_task"
    _request_schema = AddGuestToTaskRequest
    _response_schema = AddGuestToTaskResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/guest/{guest_id}"
    method = "post"
    operation_id = "Guests_addToTask"
    action_identifier = "/task/{task_id}/guest/{guest_id}_post"

    path_params = {"task_id": "task_id", "guest_id": "guest_id"}
    query_params = {
        "include_shared": "include_shared",
        "custom_task_ids": "custom_task_ids",
        "team_id": "team_id",
    }
    header_params = {}
    request_params = {"permission_level": {"__alias": "permission_level"}}

    aliases = {}
