import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class StopATimeEntryRequest(BaseModel):
    """Request schema for `StopATimeEntry`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )


class StopATimeEntryResponse(BaseModel):
    """Response schema for `StopATimeEntry`"""

    data: t.Dict[str, t.Any]


class StopATimeEntry(OpenAPIAction):
    """Stop a timer that's currently running for the authenticated user."""

    _tags = ["Time Tracking"]
    _display_name = "stop_a_time_entry"
    _request_schema = StopATimeEntryRequest
    _response_schema = StopATimeEntryResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/time_entries/stop"
    method = "post"
    operation_id = "TimeTracking_stopTimeEntry"
    action_identifier = "/team/{team_id}/time_entries/stop_post"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
