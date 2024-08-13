import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetSpaceTagsRequest(BaseModel):
    """Request schema for `GetSpaceTags`"""

    space_id: int = Field(
        ...,
        alias="space_id",
        description="",
    )


class GetSpaceTagsResponse(BaseModel):
    """Response schema for `GetSpaceTags`"""

    data: t.Dict[str, t.Any]


class GetSpaceTags(OpenAPIAction):
    """View the task Tags available in a Space."""

    _tags = ["Tags"]
    _display_name = "get_space_tags"
    _request_schema = GetSpaceTagsRequest
    _response_schema = GetSpaceTagsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/tag"
    method = "get"
    operation_id = "Tags_getSpace"
    action_identifier = "/space/{space_id}/tag_get"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
