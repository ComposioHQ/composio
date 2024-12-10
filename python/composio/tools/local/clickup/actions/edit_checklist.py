import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class EditChecklistRequest(BaseModel):
    """Request schema for `EditChecklist`"""

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
    position: t.Optional[int] = Field(
        default=None,
        alias="position",
        description=(
            "Position refers to the order of appearance of checklists on a task.   To "
            "set a checklist to appear at the top of the checklists section of a task, "
            'use `"position": 0`. '
        ),
    )


class EditChecklistResponse(BaseModel):
    """Response schema for `EditChecklist`"""

    data: t.Dict[str, t.Any]


class EditChecklist(OpenAPIAction):
    """
    Rename a task checklist, or reorder a checklist so it appears above or below
    other checklists on a task.
    """

    _tags = ["Task Checklists"]
    _display_name = "edit_checklist"
    _request_schema = EditChecklistRequest
    _response_schema = EditChecklistResponse

    url = "https://api.clickup.com/api/v2"
    path = "/checklist/{checklist_id}"
    method = "put"
    operation_id = "TaskChecklists_updateChecklist"
    action_identifier = "/checklist/{checklist_id}_put"

    path_params = {"checklist_id": "checklist_id"}
    query_params = {}
    header_params = {}
    request_params = {"name": {"__alias": "name"}, "position": {"__alias": "position"}}

    aliases = {}
