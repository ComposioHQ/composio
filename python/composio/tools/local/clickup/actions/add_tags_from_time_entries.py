import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class AddTagsFromTimeEntriesRequest(BaseModel):
    """Request schema for `AddTagsFromTimeEntries`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    tags: t.List[dict] = Field(
        default=...,
        alias="tags",
        description="",
    )
    time_entry_ids: t.List[str] = Field(
        default=...,
        alias="time_entry_ids",
        description="",
    )


class AddTagsFromTimeEntriesResponse(BaseModel):
    """Response schema for `AddTagsFromTimeEntries`"""

    data: t.Dict[str, t.Any]


class AddTagsFromTimeEntries(OpenAPIAction):
    """Add a label to a time entry."""

    _tags = ["Time Tracking"]
    _display_name = "add_tags_from_time_entries"
    _request_schema = AddTagsFromTimeEntriesRequest
    _response_schema = AddTagsFromTimeEntriesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/time_entries/tags"
    method = "post"
    operation_id = "TimeTracking_addTagsFromTimeEntries"
    action_identifier = "/team/{team_id}/time_entries/tags_post"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "tags": {"__alias": "tags"},
        "time_entry_ids": {"__alias": "time_entry_ids"},
    }

    aliases = {}
