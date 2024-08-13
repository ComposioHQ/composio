import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetTaskTemplatesRequest(BaseModel):
    """Request schema for `GetTaskTemplates`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    page: int = Field(
        ...,
        alias="page",
        description="",
    )


class GetTaskTemplatesResponse(BaseModel):
    """Response schema for `GetTaskTemplates`"""

    data: t.Dict[str, t.Any]


class GetTaskTemplates(OpenAPIAction):
    """View the task templates available in a Workspace."""

    _tags = ["Task Templates"]
    _display_name = "get_task_templates"
    _request_schema = GetTaskTemplatesRequest
    _response_schema = GetTaskTemplatesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/taskTemplate"
    method = "get"
    operation_id = "TaskTemplates_getTemplates"
    action_identifier = "/team/{team_id}/taskTemplate_get"

    path_params = {"team_id": "team_id"}
    query_params = {"page": "page"}
    header_params = {}
    request_params = {}

    aliases = {}
