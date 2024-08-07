import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class UpdateWebhookRequest(BaseModel):
    """Request schema for `UpdateWebhook`"""

    webhook_id: str = Field(
        ...,
        alias="webhook_id",
        description="e506-4a29-9d42-26e504e3435e (uuid)",
    )
    endpoint: str = Field(
        default=...,
        alias="endpoint",
        description="Endpoint",
    )
    events: str = Field(
        default=...,
        alias="events",
        description="Events",
    )
    status: str = Field(
        default=...,
        alias="status",
        description="Status",
    )


class UpdateWebhookResponse(BaseModel):
    """Response schema for `UpdateWebhook`"""

    data: t.Dict[str, t.Any]


class UpdateWebhook(OpenAPIAction):
    """Update a webhook to change the events to be monitored."""

    _tags = ["Webhooks"]
    _display_name = "update_webhook"
    _request_schema = UpdateWebhookRequest
    _response_schema = UpdateWebhookResponse

    url = "https://api.clickup.com/api/v2"
    path = "/webhook/{webhook_id}"
    method = "put"
    operation_id = "Webhooks_updateEventsToMonitor"
    action_identifier = "/webhook/{webhook_id}_put"

    path_params = {"webhook_id": "webhook_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "endpoint": {"__alias": "endpoint"},
        "events": {"__alias": "events"},
        "status": {"__alias": "status"},
    }

    aliases = {}
