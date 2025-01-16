import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateATimeEntryRequest(BaseModel):
    """Request schema for `CreateATimeEntry`"""

    team_Id: int = Field(
        ...,
        alias="team_Id",
        description="Team ID (Workspace)",
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
    tags: t.Optional[t.List[dict]] = Field(
        default=None,
        alias="tags",
        description="Users on the Business Plan and above can include a time tracking label.",
    )
    description: t.Optional[str] = Field(
        default=None,
        alias="description",
        description="Description",
    )
    start: int = Field(
        default=...,
        alias="start",
        description="Start",
    )
    stop: t.Optional[int] = Field(
        default=None,
        alias="stop",
        description="The `duration` parameter can be used instead of the `stop` parameter. ",
    )
    end: t.Optional[int] = Field(
        default=None,
        alias="end",
        description="End",
    )
    billable: t.Optional[bool] = Field(
        default=None,
        alias="billable",
        description="Billable",
    )
    duration: int = Field(
        default=...,
        alias="duration",
        description=(
            "When there are values for both `start` and `end`, `duration` is ignored. "
            "The `stop` parameter can be used instead of the `duration` parameter. "
        ),
    )
    assignee: t.Optional[int] = Field(
        default=None,
        alias="assignee",
        description=(
            "Workspace owners and admins can include any user id. Workspace members can "
            "only include their own user id. "
        ),
    )
    tid: t.Optional[str] = Field(
        default=None,
        alias="tid",
        description="Tid",
    )


class CreateATimeEntryResponse(BaseModel):
    """Response schema for `CreateATimeEntry`"""

    data: t.Dict[str, t.Any]


class CreateATimeEntry(OpenAPIAction):
    """
    Create a time entry.    ***Note:** A time entry that has a negative duration
    means that timer is currently running for that user.*
    """

    _tags = ["Time Tracking"]
    _display_name = "create_a_time_entry"
    _request_schema = CreateATimeEntryRequest
    _response_schema = CreateATimeEntryResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_Id}/time_entries"
    method = "post"
    operation_id = "TimeTracking_createTimeEntry"
    action_identifier = "/team/{team_Id}/time_entries_post"

    path_params = {"team_Id": "team_Id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {
        "tags": {"__alias": "tags"},
        "description": {"__alias": "description"},
        "start": {"__alias": "start"},
        "stop": {"__alias": "stop"},
        "end": {"__alias": "end"},
        "billable": {"__alias": "billable"},
        "duration": {"__alias": "duration"},
        "assignee": {"__alias": "assignee"},
        "tid": {"__alias": "tid"},
    }

    aliases = {}
