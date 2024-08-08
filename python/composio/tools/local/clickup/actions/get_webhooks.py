import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetWebhooksRequest(BaseModel):
    """Request schema for `GetWebhooks`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )


class GetWebhooksResponse(BaseModel):
    """Response schema for `GetWebhooks`"""

    data: t.Dict[str, t.Any]


class GetWebhooks(OpenAPIAction):
    """
    View the webhooks created via the API for a Workspace. This endpoint returns
    webhooks created by the authenticated user.
    """

    _tags = ["Webhooks"]
    _display_name = "get_webhooks"
    _request_schema = GetWebhooksRequest
    _response_schema = GetWebhooksResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/webhook"
    method = "get"
    operation_id = "Webhooks_workspaceGet"
    action_identifier = "/team/{team_id}/webhook_get"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
