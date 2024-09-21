import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class ChangeTagNamesFromTimeEntriesRequest(BaseModel):
    """Request schema for `ChangeTagNamesFromTimeEntries`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )
    new_name: str = Field(
        default=...,
        alias="new_name",
        description="New Name",
    )
    tag_bg: str = Field(
        default=...,
        alias="tag_bg",
        description="Tag Bg",
    )
    tag_fg: str = Field(
        default=...,
        alias="tag_fg",
        description="Tag Fg",
    )


class ChangeTagNamesFromTimeEntriesResponse(BaseModel):
    """Response schema for `ChangeTagNamesFromTimeEntries`"""

    data: t.Dict[str, t.Any]


class ChangeTagNamesFromTimeEntries(OpenAPIAction):
    """Rename an time entry label."""

    _tags = ["Time Tracking"]
    _display_name = "change_tag_names_from_time_entries"
    _request_schema = ChangeTagNamesFromTimeEntriesRequest
    _response_schema = ChangeTagNamesFromTimeEntriesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/time_entries/tags"
    method = "put"
    operation_id = "TimeTracking_changeTagNames"
    action_identifier = "/team/{team_id}/time_entries/tags_put"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "name": {"__alias": "name"},
        "new_name": {"__alias": "new_name"},
        "tag_bg": {"__alias": "tag_bg"},
        "tag_fg": {"__alias": "tag_fg"},
    }

    aliases = {}
