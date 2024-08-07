import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class RemoveTagsFromTimeEntriesRequest(BaseModel):
    """Request schema for `RemoveTagsFromTimeEntries`"""

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


class RemoveTagsFromTimeEntriesResponse(BaseModel):
    """Response schema for `RemoveTagsFromTimeEntries`"""

    data: t.Dict[str, t.Any]


class RemoveTagsFromTimeEntries(OpenAPIAction):
    """
    Remove labels from time entries. This does not remove the label from a Workspace.
    """

    _tags = ["Time Tracking"]
    _display_name = "remove_tags_from_time_entries"
    _request_schema = RemoveTagsFromTimeEntriesRequest
    _response_schema = RemoveTagsFromTimeEntriesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/time_entries/tags"
    method = "delete"
    operation_id = "TimeTracking_removeTagsFromTimeEntries"
    action_identifier = "/team/{team_id}/time_entries/tags_delete"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "tags": {"__alias": "tags"},
        "time_entry_ids": {"__alias": "time_entry_ids"},
    }

    aliases = {}
