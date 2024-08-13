import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteATimeEntryRequest(BaseModel):
    """Request schema for `DeleteATimeEntry`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    timer_id: int = Field(
        ...,
        alias="timer_id",
        description="Array of timer ids to delete separated by commas",
    )


class DeleteATimeEntryResponse(BaseModel):
    """Response schema for `DeleteATimeEntry`"""

    data: t.Dict[str, t.Any]


class DeleteATimeEntry(OpenAPIAction):
    """Delete a time entry from a Workspace."""

    _tags = ["Time Tracking"]
    _display_name = "delete_a_time_entry"
    _request_schema = DeleteATimeEntryRequest
    _response_schema = DeleteATimeEntryResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/time_entries/{timer_id}"
    method = "delete"
    operation_id = "TimeTracking_removeEntry"
    action_identifier = "/team/{team_id}/time_entries/{timer_id}_delete"

    path_params = {"team_id": "team_id", "timer_id": "timer_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
