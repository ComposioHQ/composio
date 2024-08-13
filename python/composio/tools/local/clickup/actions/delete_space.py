import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteSpaceRequest(BaseModel):
    """Request schema for `DeleteSpace`"""

    space_id: int = Field(
        ...,
        alias="space_id",
        description="",
    )


class DeleteSpaceResponse(BaseModel):
    """Response schema for `DeleteSpace`"""

    data: t.Dict[str, t.Any]


class DeleteSpace(OpenAPIAction):
    """Delete a Space from your Workspace."""

    _tags = ["Spaces"]
    _display_name = "delete_space"
    _request_schema = DeleteSpaceRequest
    _response_schema = DeleteSpaceResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}"
    method = "delete"
    operation_id = "Spaces_removeSpace"
    action_identifier = "/space/{space_id}_delete"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
