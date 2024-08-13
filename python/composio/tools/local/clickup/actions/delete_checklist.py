import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteChecklistRequest(BaseModel):
    """Request schema for `DeleteChecklist`"""

    checklist_id: str = Field(
        ...,
        alias="checklist_id",
        description="b8a8-48d8-a0c6-b4200788a683 (uuid)",
    )


class DeleteChecklistResponse(BaseModel):
    """Response schema for `DeleteChecklist`"""

    data: t.Dict[str, t.Any]


class DeleteChecklist(OpenAPIAction):
    """Delete a checklist from a task."""

    _tags = ["Task Checklists"]
    _display_name = "delete_checklist"
    _request_schema = DeleteChecklistRequest
    _response_schema = DeleteChecklistResponse

    url = "https://api.clickup.com/api/v2"
    path = "/checklist/{checklist_id}"
    method = "delete"
    operation_id = "TaskChecklists_removeChecklist"
    action_identifier = "/checklist/{checklist_id}_delete"

    path_params = {"checklist_id": "checklist_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
