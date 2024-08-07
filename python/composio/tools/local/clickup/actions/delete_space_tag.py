import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteSpaceTagRequest(BaseModel):
    """Request schema for `DeleteSpaceTag`"""

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
    tag_tag_fg: str = Field(
        default=...,
        alias="tag__tag_fg",
        description="Tag Fg",
    )
    tag_tag_bg: str = Field(
        default=...,
        alias="tag__tag_bg",
        description="Tag Bg",
    )


class DeleteSpaceTagResponse(BaseModel):
    """Response schema for `DeleteSpaceTag`"""

    data: t.Dict[str, t.Any]


class DeleteSpaceTag(OpenAPIAction):
    """Delete a task Tag from a Space."""

    _tags = ["Tags"]
    _display_name = "delete_space_tag"
    _request_schema = DeleteSpaceTagRequest
    _response_schema = DeleteSpaceTagResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/tag/{tag_name}"
    method = "delete"
    operation_id = "Tags_removeSpaceTag"
    action_identifier = "/space/{space_id}/tag/{tag_name}_delete"

    path_params = {"space_id": "space_id", "tag_name": "tag_name"}
    query_params = {}
    header_params = {}
    request_params = {
        "tag": {
            "__alias": "tag",
            "tag_fg": {"__alias": "tag_fg"},
            "tag_bg": {"__alias": "tag_bg"},
        }
    }

    aliases = {"tag": "76f59ca3"}
