import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class StartATimeEntryRequest(BaseModel):
    """Request schema for `StartATimeEntry`"""

    team_Id: int = Field(
        ...,
        alias="team_Id",
        description="Team ID (Workspace)",
    )
    custom_task_ids: t.Optional[bool] = Field(
        default=None,
        alias="custom_task_ids",
        description=(
            'If you want to reference a task by it"s custom task id, this value must '
            "be `true`. "
        ),
    )
    team_id: t.Optional[int] = Field(
        default=None,
        alias="team_id",
        description=(
            "Only used when the `custom_task_ids` parameter is set to `true`.   For example: "
            "`custom_task_ids=true&team_id=123`. "
        ),
    )
    tags: t.Optional[t.List[dict]] = Field(
        default=None,
        alias="tags",
        description="Users on the Business Plan and above can include a time tracking label.",
    )
    description: t.Optional[str] = Field(
        default=None,
        alias="description",
        description="Description",
    )
    tid: t.Optional[str] = Field(
        default=None,
        alias="tid",
        description="Tid",
    )
    billable: t.Optional[bool] = Field(
        default=None,
        alias="billable",
        description="Billable",
    )


class StartATimeEntryResponse(BaseModel):
    """Response schema for `StartATimeEntry`"""

    data: t.Dict[str, t.Any]


class StartATimeEntry(OpenAPIAction):
    """Start a timer for the authenticated user."""

    _tags = ["Time Tracking"]
    _display_name = "start_a_time_entry"
    _request_schema = StartATimeEntryRequest
    _response_schema = StartATimeEntryResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_Id}/time_entries/start"
    method = "post"
    operation_id = "TimeTracking_startTimer"
    action_identifier = "/team/{team_Id}/time_entries/start_post"

    path_params = {"team_Id": "team_Id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {
        "tags": {"__alias": "tags"},
        "description": {"__alias": "description"},
        "tid": {"__alias": "tid"},
        "billable": {"__alias": "billable"},
    }

    aliases = {}
