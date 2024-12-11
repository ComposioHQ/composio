import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetSpacesRequest(BaseModel):
    """Request schema for `GetSpaces`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    archived: t.Optional[bool] = Field(
        default=None,
        alias="archived",
        description="",
    )


class GetSpacesResponse(BaseModel):
    """Response schema for `GetSpaces`"""

    data: t.Dict[str, t.Any]


class GetSpaces(OpenAPIAction):
    """
    View the Spaces available in a Workspace. You can only get member info in
    private Spaces.
    """

    _tags = ["Spaces"]
    _display_name = "get_spaces"
    _request_schema = GetSpacesRequest
    _response_schema = GetSpacesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/space"
    method = "get"
    operation_id = "Spaces_getSpaceDetails"
    action_identifier = "/team/{team_id}/space_get"

    path_params = {"team_id": "team_id"}
    query_params = {"archived": "archived"}
    header_params = {}
    request_params = {}

    aliases = {}


class spaces_get_space_details(OpenAPIAction):
    """
    View the Spaces available in a Workspace. You can only get member info in
    private Spaces.<<DEPRECATED use get_spaces>>
    """

    _tags = ["Spaces"]
    _display_name = "spaces_get_space_details"
    _request_schema = GetSpacesRequest
    _response_schema = GetSpacesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/space"
    method = "get"
    operation_id = "Spaces_getSpaceDetails"
    action_identifier = "/team/{team_id}/space_get"

    path_params = {"team_id": "team_id"}
    query_params = {"archived": "archived"}
    header_params = {}
    request_params = {}

    aliases = {}
