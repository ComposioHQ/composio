import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetCustomTaskTypesRequest(BaseModel):
    """Request schema for `GetCustomTaskTypes`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )


class GetCustomTaskTypesResponse(BaseModel):
    """Response schema for `GetCustomTaskTypes`"""

    data: t.Dict[str, t.Any]


class GetCustomTaskTypes(OpenAPIAction):
    """View the custom task types available in a Workspace."""

    _tags = ["Custom Task Types"]
    _display_name = "get_custom_task_types"
    _request_schema = GetCustomTaskTypesRequest
    _response_schema = GetCustomTaskTypesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/custom_item"
    method = "get"
    operation_id = "CustomTaskTypes_getAvailableTaskTypes"
    action_identifier = "/team/{team_id}/custom_item_get"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
