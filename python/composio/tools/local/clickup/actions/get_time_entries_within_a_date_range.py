import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetTimeEntriesWithinADateRangeRequest(BaseModel):
    """Request schema for `GetTimeEntriesWithinADateRange`"""

    team_Id: int = Field(
        ...,
        alias="team_Id",
        description="Team ID (Workspace)",
    )
    start_date: t.Optional[int] = Field(
        default=None,
        alias="start_date",
        description="Unix time in milliseconds",
    )
    end_date: t.Optional[int] = Field(
        default=None,
        alias="end_date",
        description="Unix time in milliseconds",
    )
    assignee: t.Optional[int] = Field(
        default=None,
        alias="assignee",
        description=(
            "Filter by `user_id`. For multiple assignees, separate `user_id` using commas. "
            "   **Example:** `assignee=1234,9876`   ***Note:** Only Workspace Owners/Admins "
            "have access to do this.* "
        ),
    )
    include_task_tags: t.Optional[bool] = Field(
        default=None,
        alias="include_task_tags",
        description=(
            "Include task tags in the response for time entries associated with tasks. "
        ),
    )
    include_location_names: t.Optional[bool] = Field(
        default=None,
        alias="include_location_names",
        description=(
            "Include the names of the List, Folder, and Space along with the `list_id`,`folder_id`, "
            "and `space_id`. "
        ),
    )
    space_id: t.Optional[int] = Field(
        default=None,
        alias="space_id",
        description="Only include time entries associated with tasks in a specific Space.",
    )
    folder_id: t.Optional[int] = Field(
        default=None,
        alias="folder_id",
        description="Only include time entries associated with tasks in a specific Folder.",
    )
    list_id: t.Optional[int] = Field(
        default=None,
        alias="list_id",
        description="Only include time entries associated with tasks in a specific List.",
    )
    task_id: t.Optional[str] = Field(
        default=None,
        alias="task_id",
        description="Only include time entries associated with a specific task.",
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


class GetTimeEntriesWithinADateRangeResponse(BaseModel):
    """Response schema for `GetTimeEntriesWithinADateRange`"""

    data: t.Dict[str, t.Any]


class GetTimeEntriesWithinADateRange(OpenAPIAction):
    """
    This API endpoint retrieves time entries for the past 30 days for the user
    or others using the `assignee` parameter, and allows filtering by `space_id`
    or `task_id`. Negative durations show active timers.
    """

    _tags = ["Time Tracking"]
    _display_name = "get_time_entries_within_a_date_range"
    _request_schema = GetTimeEntriesWithinADateRangeRequest
    _response_schema = GetTimeEntriesWithinADateRangeResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_Id}/time_entries"
    method = "get"
    operation_id = "TimeTracking_getTimeEntriesWithinDateRange"
    action_identifier = "/team/{team_Id}/time_entries_get"

    path_params = {"team_Id": "team_Id"}
    query_params = {
        "start_date": "start_date",
        "end_date": "end_date",
        "assignee": "assignee",
        "include_task_tags": "include_task_tags",
        "include_location_names": "include_location_names",
        "space_id": "space_id",
        "folder_id": "folder_id",
        "list_id": "list_id",
        "task_id": "task_id",
        "custom_task_ids": "custom_task_ids",
        "team_id": "team_id",
    }
    header_params = {}
    request_params = {}

    aliases = {}
