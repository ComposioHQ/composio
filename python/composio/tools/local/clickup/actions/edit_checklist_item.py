import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class EditChecklistItemRequest(BaseModel):
    """Request schema for `EditChecklistItem`"""

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
    name: t.Optional[str] = Field(
        default=None,
        alias="name",
        description="Name",
    )
    assignee: t.Optional[str] = Field(
        default=None,
        alias="assignee",
        description="Assignee",
    )
    resolved: t.Optional[bool] = Field(
        default=None,
        alias="resolved",
        description="Resolved",
    )
    parent: t.Optional[str] = Field(
        default=None,
        alias="parent",
        description=(
            "To nest a checklist item under another checklist item, include the other "
            'item"s `checklist_item_id`. '
        ),
    )


class EditChecklistItemResponse(BaseModel):
    """Response schema for `EditChecklistItem`"""

    data: t.Dict[str, t.Any]


class EditChecklistItem(OpenAPIAction):
    """
    Update an individual line item in a task checklist.    You can rename it,
    set the assignee, mark it as resolved, or nest it under another checklist
    item.
    """

    _tags = ["Task Checklists"]
    _display_name = "edit_checklist_item"
    _request_schema = EditChecklistItemRequest
    _response_schema = EditChecklistItemResponse

    url = "https://api.clickup.com/api/v2"
    path = "/checklist/{checklist_id}/checklist_item/{checklist_item_id}"
    method = "put"
    operation_id = "TaskChecklists_updateChecklistItem"
    action_identifier = (
        "/checklist/{checklist_id}/checklist_item/{checklist_item_id}_put"
    )

    path_params = {
        "checklist_id": "checklist_id",
        "checklist_item_id": "checklist_item_id",
    }
    query_params = {}
    header_params = {}
    request_params = {
        "name": {"__alias": "name"},
        "assignee": {"__alias": "assignee"},
        "resolved": {"__alias": "resolved"},
        "parent": {"__alias": "parent"},
    }

    aliases = {}
