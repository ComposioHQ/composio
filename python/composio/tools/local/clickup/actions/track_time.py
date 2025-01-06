import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class TrackTimeRequest(BaseModel):
    """Request schema for `TrackTime`"""

    task_id: str = Field(
        ...,
        alias="task_id",
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


class TrackTimeResponse(BaseModel):
    """Response schema for `TrackTime`"""

    data: t.Dict[str, t.Any]


class TrackTime(OpenAPIAction):
    """
    ***Note:** This is a legacy time tracking endpoint. We recommend using the
    Time Tracking API endpoints to manage time entries.*
    """

    _tags = ["Time Tracking (Legacy)"]
    _display_name = "track_time"
    _request_schema = TrackTimeRequest
    _response_schema = TrackTimeResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/time"
    method = "post"
    operation_id = "TimeTrackingLegacy_recordTimeForTask"
    action_identifier = "/task/{task_id}/time_post"

    path_params = {"task_id": "task_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {
        "start": {"__alias": "start"},
        "end": {"__alias": "end"},
        "time": {"__alias": "time"},
    }

    aliases = {}
