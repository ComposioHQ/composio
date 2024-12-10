import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateWebhookRequest(BaseModel):
    """Request schema for `CreateWebhook`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    endpoint: str = Field(
        default=...,
        alias="endpoint",
        description="Endpoint",
    )
    events: t.List[str] = Field(
        default=...,
        alias="events",
        description="Events",
    )
    space_id: t.Optional[int] = Field(
        default=None,
        alias="space_id",
        description="Space Id",
    )
    folder_id: t.Optional[int] = Field(
        default=None,
        alias="folder_id",
        description="Folder Id",
    )
    list_id: t.Optional[int] = Field(
        default=None,
        alias="list_id",
        description="List Id",
    )
    task_id: t.Optional[str] = Field(
        default=None,
        alias="task_id",
        description="Task Id",
    )


class CreateWebhookResponse(BaseModel):
    """Response schema for `CreateWebhook`"""

    data: t.Dict[str, t.Any]


class CreateWebhook(OpenAPIAction):
    """
    Set up a webhook to monitor for events.<br> We do not have a dedicated IP
    address for webhooks. We use our domain name and dynamic addressing.
    """

    _tags = ["Webhooks"]
    _display_name = "create_webhook"
    _request_schema = CreateWebhookRequest
    _response_schema = CreateWebhookResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/webhook"
    method = "post"
    operation_id = "Webhooks_createWebhook"
    action_identifier = "/team/{team_id}/webhook_post"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "endpoint": {"__alias": "endpoint"},
        "events": {"__alias": "events"},
        "space_id": {"__alias": "space_id"},
        "folder_id": {"__alias": "folder_id"},
        "list_id": {"__alias": "list_id"},
        "task_id": {"__alias": "task_id"},
    }

    aliases = {}
