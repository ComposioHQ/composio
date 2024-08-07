import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class EditSpaceTagRequest(BaseModel):
    """Request schema for `EditSpaceTag`"""

    space_id: int = Field(
        ...,
        alias="space_id",
        description="",
    )
    tag_name: str = Field(
        ...,
        alias="tag_name",
        description="",
    )
    tag_fg_color: str = Field(
        default=...,
        alias="tag__fg_color",
        description="Fg Color",
    )
    tag_bg_color: str = Field(
        default=...,
        alias="tag__bg_color",
        description="Bg Color",
    )


class EditSpaceTagResponse(BaseModel):
    """Response schema for `EditSpaceTag`"""

    data: t.Dict[str, t.Any]


class EditSpaceTag(OpenAPIAction):
    """Update a task Tag."""

    _tags = ["Tags"]
    _display_name = "edit_space_tag"
    _request_schema = EditSpaceTagRequest
    _response_schema = EditSpaceTagResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/tag/{tag_name}"
    method = "put"
    operation_id = "Tags_updateSpaceTag"
    action_identifier = "/space/{space_id}/tag/{tag_name}_put"

    path_params = {"space_id": "space_id", "tag_name": "tag_name"}
    query_params = {}
    header_params = {}
    request_params = {
        "tag": {
            "__alias": "tag",
            "fg_color": {"__alias": "fg_color"},
            "bg_color": {"__alias": "bg_color"},
        }
    }

    aliases = {"tag": "76f59ca3"}
