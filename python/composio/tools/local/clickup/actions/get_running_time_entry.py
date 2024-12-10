import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetRunningTimeEntryRequest(BaseModel):
    """Request schema for `GetRunningTimeEntry`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    assignee: t.Optional[int] = Field(
        default=None,
        alias="assignee",
        description="user id",
    )


class GetRunningTimeEntryResponse(BaseModel):
    """Response schema for `GetRunningTimeEntry`"""

    data: t.Dict[str, t.Any]


class GetRunningTimeEntry(OpenAPIAction):
    """
    View a time entry that's currently tracking time for the authenticated user.
    ***Note:** A time entry that has a negative duration means that timer
    is currently running for that user.*
    """

    _tags = ["Time Tracking"]
    _display_name = "get_running_time_entry"
    _request_schema = GetRunningTimeEntryRequest
    _response_schema = GetRunningTimeEntryResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/time_entries/current"
    method = "get"
    operation_id = "TimeTracking_getCurrentTimeEntry"
    action_identifier = "/team/{team_id}/time_entries/current_get"

    path_params = {"team_id": "team_id"}
    query_params = {"assignee": "assignee"}
    header_params = {}
    request_params = {}

    aliases = {}
