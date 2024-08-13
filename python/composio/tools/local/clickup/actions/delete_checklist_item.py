import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteChecklistItemRequest(BaseModel):
    """Request schema for `DeleteChecklistItem`"""

    checklist_id: str = Field(
        ...,
        alias="checklist_id",
        description="b8a8-48d8-a0c6-b4200788a683 (uuid)",
    )
    checklist_item_id: str = Field(
        ...,
        alias="checklist_item_id",
        description="e491-47f5-9fd8-d1dc4cedcc6f (uuid)",
    )


class DeleteChecklistItemResponse(BaseModel):
    """Response schema for `DeleteChecklistItem`"""

    data: t.Dict[str, t.Any]


class DeleteChecklistItem(OpenAPIAction):
    """Delete a line item from a task checklist."""

    _tags = ["Task Checklists"]
    _display_name = "delete_checklist_item"
    _request_schema = DeleteChecklistItemRequest
    _response_schema = DeleteChecklistItemResponse

    url = "https://api.clickup.com/api/v2"
    path = "/checklist/{checklist_id}/checklist_item/{checklist_item_id}"
    method = "delete"
    operation_id = "TaskChecklists_removeChecklistItem"
    action_identifier = (
        "/checklist/{checklist_id}/checklist_item/{checklist_item_id}_delete"
    )

    path_params = {
        "checklist_id": "checklist_id",
        "checklist_item_id": "checklist_item_id",
    }
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
