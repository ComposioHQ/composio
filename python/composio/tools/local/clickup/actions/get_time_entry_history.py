import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetTimeEntryHistoryRequest(BaseModel):
    """Request schema for `GetTimeEntryHistory`"""

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
            "Within a Date Range](https://clickup.com/api/clickupreference/operation/Gettimeentrieswithinadaterange/) "
            "endpoint. "
        ),
    )


class GetTimeEntryHistoryResponse(BaseModel):
    """Response schema for `GetTimeEntryHistory`"""

    data: t.Dict[str, t.Any]


class GetTimeEntryHistory(OpenAPIAction):
    """View a list of changes made to a time entry."""

    _tags = ["Time Tracking"]
    _display_name = "get_time_entry_history"
    _request_schema = GetTimeEntryHistoryRequest
    _response_schema = GetTimeEntryHistoryResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/time_entries/{timer_id}/history"
    method = "get"
    operation_id = "TimeTracking_getTimeEntryHistory"
    action_identifier = "/team/{team_id}/time_entries/{timer_id}/history_get"

    path_params = {"team_id": "team_id", "timer_id": "timer_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
