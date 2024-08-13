import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteWebhookRequest(BaseModel):
    """Request schema for `DeleteWebhook`"""

    webhook_id: str = Field(
        ...,
        alias="webhook_id",
        description="e506-4a29-9d42-26e504e3435e (uuid)",
    )


class DeleteWebhookResponse(BaseModel):
    """Response schema for `DeleteWebhook`"""

    data: t.Dict[str, t.Any]


class DeleteWebhook(OpenAPIAction):
    """
    Delete a webhook to stop monitoring the events and locations of the webhook.
    """

    _tags = ["Webhooks"]
    _display_name = "delete_webhook"
    _request_schema = DeleteWebhookRequest
    _response_schema = DeleteWebhookResponse

    url = "https://api.clickup.com/api/v2"
    path = "/webhook/{webhook_id}"
    method = "delete"
    operation_id = "Webhooks_removeWebhookById"
    action_identifier = "/webhook/{webhook_id}_delete"

    path_params = {"webhook_id": "webhook_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
