import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetSingularTimeEntryRequest(BaseModel):
    """Request schema for `GetSingularTimeEntry`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    timer_id: str = Field(
        ...,
        alias="timer_id",
        description=(
            "The ID of a time entry.    This can be found using the [Get Time Entries "
            "Within a Date Range](https://clickup.com/api) endpoint. "
        ),
    )
    include_task: t.Optional[bool] = Field(
        default=None,
        alias="include_task_",
        description="Include task  in the response for time entries associated with tasks.",
    )
    include_location_names: t.Optional[bool] = Field(
        default=None,
        alias="include_location_names",
        description=(
            "Include the names of the List, Folder, and Space along with `list_id`,`folder_id`, "
            "and `space_id`. "
        ),
    )


class GetSingularTimeEntryResponse(BaseModel):
    """Response schema for `GetSingularTimeEntry`"""

    data: t.Dict[str, t.Any]


class GetSingularTimeEntry(OpenAPIAction):
    """
    View a single time entry.    ***Note:** A time entry that has a negative
    duration means that timer is currently running for that user.*
    """

    _tags = ["Time Tracking"]
    _display_name = "get_singular_time_entry"
    _request_schema = GetSingularTimeEntryRequest
    _response_schema = GetSingularTimeEntryResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/time_entries/{timer_id}"
    method = "get"
    operation_id = "TimeTracking_getSingleTimeEntry"
    action_identifier = "/team/{team_id}/time_entries/{timer_id}_get"

    path_params = {"team_id": "team_id", "timer_id": "timer_id"}
    query_params = {
        "include_task": "include_task_",
        "include_location_names": "include_location_names",
    }
    header_params = {}
    request_params = {}

    aliases = {}
