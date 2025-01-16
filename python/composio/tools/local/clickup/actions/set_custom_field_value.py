import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class SetCustomFieldValueRequest(BaseModel):
    """Request schema for `SetCustomFieldValue`"""

    task_id: str = Field(
        ...,
        alias="task_id",
        description="Enter the task ID of the task you want to update.",
    )
    field_id: str = Field(
        ...,
        alias="field_id",
        description=(
            "Enter the universal unique identifier (UUID) of the Custom Field you want "
            "to set. "
        ),
    )
    custom_task_ids: t.Optional[bool] = Field(
        default=None,
        alias="custom_task_ids",
        description=(
            "If you want to reference a task by its Custom Task ID, this value must be "
            "`true`. "
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


class SetCustomFieldValueResponse(BaseModel):
    """Response schema for `SetCustomFieldValue`"""

    data: t.Dict[str, t.Any]


class SetCustomFieldValue(OpenAPIAction):
    """
    To add data to a task's Custom Field, obtain the `task_id` and the Custom
    Field's `field_id` (UUID). Use the "Get Accessible Custom Fields" or "Get
    Task" API endpoints to find the `field_id`.
    """

    _tags = ["Custom Fields"]
    _display_name = "set_custom_field_value"
    _request_schema = SetCustomFieldValueRequest
    _response_schema = SetCustomFieldValueResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/field/{field_id}"
    method = "post"
    operation_id = "CustomFields_setFieldValue"
    action_identifier = "/task/{task_id}/field/{field_id}_post"

    path_params = {"task_id": "task_id", "field_id": "field_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {}

    aliases = {}
