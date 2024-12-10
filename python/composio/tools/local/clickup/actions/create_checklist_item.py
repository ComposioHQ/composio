import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateChecklistItemRequest(BaseModel):
    """Request schema for `CreateChecklistItem`"""

    checklist_id: str = Field(
        ...,
        alias="checklist_id",
        description="b8a8-48d8-a0c6-b4200788a683 (uuid)",
    )
    name: t.Optional[str] = Field(
        default=None,
        alias="name",
        description="Name",
    )
    assignee: t.Optional[int] = Field(
        default=None,
        alias="assignee",
        description="Assignee",
    )


class CreateChecklistItemResponse(BaseModel):
    """Response schema for `CreateChecklistItem`"""

    data: t.Dict[str, t.Any]


class CreateChecklistItem(OpenAPIAction):
    """Add a line item to a task checklist."""

    _tags = ["Task Checklists"]
    _display_name = "create_checklist_item"
    _request_schema = CreateChecklistItemRequest
    _response_schema = CreateChecklistItemResponse

    url = "https://api.clickup.com/api/v2"
    path = "/checklist/{checklist_id}/checklist_item"
    method = "post"
    operation_id = "TaskChecklists_addLineItem"
    action_identifier = "/checklist/{checklist_id}/checklist_item_post"

    path_params = {"checklist_id": "checklist_id"}
    query_params = {}
    header_params = {}
    request_params = {"name": {"__alias": "name"}, "assignee": {"__alias": "assignee"}}

    aliases = {}
