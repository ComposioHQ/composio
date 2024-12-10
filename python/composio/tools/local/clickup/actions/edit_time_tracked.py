import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class EditTimeTrackedRequest(BaseModel):
    """Request schema for `EditTimeTracked`"""

    task_id: str = Field(
        ...,
        alias="task_id",
        description="",
    )
    interval_id: str = Field(
        ...,
        alias="interval_id",
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
    team_id: t.Optional[int] = Field(
        default=None,
        alias="team_id",
        description=(
            "Only used when the `custom_task_ids` parameter is set to `true`.   For example: "
            "`custom_task_ids=true&team_id=123`. "
        ),
    )
    start: int = Field(
        default=...,
        alias="start",
        description="Start",
    )
    end: int = Field(
        default=...,
        alias="end",
        description="End",
    )
    time: int = Field(
        default=...,
        alias="time",
        description="Time",
    )


class EditTimeTrackedResponse(BaseModel):
    """Response schema for `EditTimeTracked`"""

    data: t.Dict[str, t.Any]


class EditTimeTracked(OpenAPIAction):
    """
    ***Note:** This is a legacy time tracking endpoint. We recommend using the
    Time Tracking API endpoints to manage time entries.*
    """

    _tags = ["Time Tracking (Legacy)"]
    _display_name = "edit_time_tracked"
    _request_schema = EditTimeTrackedRequest
    _response_schema = EditTimeTrackedResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/time/{interval_id}"
    method = "put"
    operation_id = "TimeTrackingLegacy_editTimeTracked"
    action_identifier = "/task/{task_id}/time/{interval_id}_put"

    path_params = {"task_id": "task_id", "interval_id": "interval_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {
        "start": {"__alias": "start"},
        "end": {"__alias": "end"},
        "time": {"__alias": "time"},
    }

    aliases = {}
