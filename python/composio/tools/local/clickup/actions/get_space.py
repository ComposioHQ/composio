import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetSpaceRequest(BaseModel):
    """Request schema for `GetSpace`"""

    space_id: int = Field(
        ...,
        alias="space_id",
        description="",
    )


class GetSpaceResponse(BaseModel):
    """Response schema for `GetSpace`"""

    data: t.Dict[str, t.Any]


class GetSpace(OpenAPIAction):
    """View the Spaces available in a Workspace."""

    _tags = ["Spaces"]
    _display_name = "get_space"
    _request_schema = GetSpaceRequest
    _response_schema = GetSpaceResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}"
    method = "get"
    operation_id = "Spaces_getDetails"
    action_identifier = "/space/{space_id}_get"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}


class spaces_get_details(OpenAPIAction):
    """View the Spaces available in a Workspace.<<DEPRECATED use get_space>>"""

    _tags = ["Spaces"]
    _display_name = "spaces_get_details"
    _request_schema = GetSpaceRequest
    _response_schema = GetSpaceResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}"
    method = "get"
    operation_id = "Spaces_getDetails"
    action_identifier = "/space/{space_id}_get"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
