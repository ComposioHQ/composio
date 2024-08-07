import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateSpaceTagRequest(BaseModel):
    """Request schema for `CreateSpaceTag`"""

    space_id: int = Field(
        ...,
        alias="space_id",
        description="",
    )
    tag_name: str = Field(
        default=...,
        alias="tag__name",
        description="Name",
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


class CreateSpaceTagResponse(BaseModel):
    """Response schema for `CreateSpaceTag`"""

    data: t.Dict[str, t.Any]


class CreateSpaceTag(OpenAPIAction):
    """Add a new task Tag to a Space."""

    _tags = ["Tags"]
    _display_name = "create_space_tag"
    _request_schema = CreateSpaceTagRequest
    _response_schema = CreateSpaceTagResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/tag"
    method = "post"
    operation_id = "Tags_createSpaceTag"
    action_identifier = "/space/{space_id}/tag_post"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "tag": {
            "__alias": "tag",
            "name": {"__alias": "name"},
            "tag_fg": {"__alias": "tag_fg"},
            "tag_bg": {"__alias": "tag_bg"},
        }
    }

    aliases = {"tag": "76f59ca3"}
