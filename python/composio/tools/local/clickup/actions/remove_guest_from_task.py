import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class RemoveGuestFromTaskRequest(BaseModel):
    """Request schema for `RemoveGuestFromTask`"""

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


class RemoveGuestFromTaskResponse(BaseModel):
    """Response schema for `RemoveGuestFromTask`"""

    data: t.Dict[str, t.Any]


class RemoveGuestFromTask(OpenAPIAction):
    """
    Revoke a guest's access to a task.    ***Note:** This endpoint is only available
    to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Guests"]
    _display_name = "remove_guest_from_task"
    _request_schema = RemoveGuestFromTaskRequest
    _response_schema = RemoveGuestFromTaskResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/guest/{guest_id}"
    method = "delete"
    operation_id = "Guests_revokeAccessToTask"
    action_identifier = "/task/{task_id}/guest/{guest_id}_delete"

    path_params = {"task_id": "task_id", "guest_id": "guest_id"}
    query_params = {
        "include_shared": "include_shared",
        "custom_task_ids": "custom_task_ids",
        "team_id": "team_id",
    }
    header_params = {}
    request_params = {}

    aliases = {}
