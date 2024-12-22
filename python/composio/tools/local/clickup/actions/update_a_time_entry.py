import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class UpdateATimeEntryRequest(BaseModel):
    """Request schema for `UpdateATimeEntry`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    timer_id: int = Field(
        ...,
        alias="timer_id",
        description="",
    )
    custom_task_ids: t.Optional[bool] = Field(
        default=None,
        alias="custom_task_ids",
        description=(
            'If you want to reference a task by it"s custom task id, this value must '
            "be `true`. "
        ),
    )
    tags: t.List[dict] = Field(
        default=...,
        alias="tags",
        description="Users on the Business Plan and above can include a time tracking label.",
    )
    description: t.Optional[str] = Field(
        default=None,
        alias="description",
        description="Description",
    )
    tag_action: t.Optional[str] = Field(
        default=None,
        alias="tag_action",
        description="Tag Action",
    )
    start: t.Optional[int] = Field(
        default=None,
        alias="start",
        description="When providing `start`, you must also provide `end`.",
    )
    end: t.Optional[int] = Field(
        default=None,
        alias="end",
        description="When providing `end`, you must also provide `start`.",
    )
    tid: t.Optional[str] = Field(
        default=None,
        alias="tid",
        description="Tid",
    )
    billable: t.Optional[bool] = Field(
        default=None,
        alias="billable",
        description="Billable",
    )
    duration: t.Optional[int] = Field(
        default=None,
        alias="duration",
        description="Duration",
    )


class UpdateATimeEntryResponse(BaseModel):
    """Response schema for `UpdateATimeEntry`"""

    data: t.Dict[str, t.Any]


class UpdateATimeEntry(OpenAPIAction):
    """Update the details of a time entry."""

    _tags = ["Time Tracking"]
    _display_name = "update_a_time_entry"
    _request_schema = UpdateATimeEntryRequest
    _response_schema = UpdateATimeEntryResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/time_entries/{timer_id}"
    method = "put"
    operation_id = "TimeTracking_updateTimeEntryDetails"
    action_identifier = "/team/{team_id}/time_entries/{timer_id}_put"

    path_params = {"team_id": "team_id", "timer_id": "timer_id"}
    query_params = {"custom_task_ids": "custom_task_ids"}
    header_params = {}
    request_params = {
        "tags": {"__alias": "tags"},
        "description": {"__alias": "description"},
        "tag_action": {"__alias": "tag_action"},
        "start": {"__alias": "start"},
        "end": {"__alias": "end"},
        "tid": {"__alias": "tid"},
        "billable": {"__alias": "billable"},
        "duration": {"__alias": "duration"},
    }

    aliases = {}
