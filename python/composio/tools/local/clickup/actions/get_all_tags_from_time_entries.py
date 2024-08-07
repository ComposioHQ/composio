import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetAllTagsFromTimeEntriesRequest(BaseModel):
    """Request schema for `GetAllTagsFromTimeEntries`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )


class GetAllTagsFromTimeEntriesResponse(BaseModel):
    """Response schema for `GetAllTagsFromTimeEntries`"""

    data: t.Dict[str, t.Any]


class GetAllTagsFromTimeEntries(OpenAPIAction):
    """
    View all the labels that have been applied to time entries in a Workspace.
    """

    _tags = ["Time Tracking"]
    _display_name = "get_all_tags_from_time_entries"
    _request_schema = GetAllTagsFromTimeEntriesRequest
    _response_schema = GetAllTagsFromTimeEntriesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/time_entries/tags"
    method = "get"
    operation_id = "TimeTracking_getAllTagsFromTimeEntries"
    action_identifier = "/team/{team_id}/time_entries/tags_get"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
