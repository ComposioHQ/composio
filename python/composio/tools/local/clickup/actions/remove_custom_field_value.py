import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class RemoveCustomFieldValueRequest(BaseModel):
    """Request schema for `RemoveCustomFieldValue`"""

    task_id: str = Field(
        ...,
        alias="task_id",
        description="",
    )
    field_id: str = Field(
        ...,
        alias="field_id",
        description="b8a8-48d8-a0c6-b4200788a683 (uuid)",
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


class RemoveCustomFieldValueResponse(BaseModel):
    """Response schema for `RemoveCustomFieldValue`"""

    data: t.Dict[str, t.Any]


class RemoveCustomFieldValue(OpenAPIAction):
    """
    Remove the data from a Custom Field on a task. This does not delete the
    option from the Custom Field.
    """

    _tags = ["Custom Fields"]
    _display_name = "remove_custom_field_value"
    _request_schema = RemoveCustomFieldValueRequest
    _response_schema = RemoveCustomFieldValueResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/field/{field_id}"
    method = "delete"
    operation_id = "CustomFields_removeFieldValue"
    action_identifier = "/task/{task_id}/field/{field_id}_delete"

    path_params = {"task_id": "task_id", "field_id": "field_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {}

    aliases = {}
