import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetAccessibleCustomFieldsRequest(BaseModel):
    """Request schema for `GetAccessibleCustomFields`"""

    list_id: int = Field(
        ...,
        alias="list_id",
        description="",
    )


class GetAccessibleCustomFieldsResponse(BaseModel):
    """Response schema for `GetAccessibleCustomFields`"""

    data: t.Dict[str, t.Any]


class GetAccessibleCustomFields(OpenAPIAction):
    """View the Custom Fields available on tasks in a specific List."""

    _tags = ["Custom Fields"]
    _display_name = "get_accessible_custom_fields"
    _request_schema = GetAccessibleCustomFieldsRequest
    _response_schema = GetAccessibleCustomFieldsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/field"
    method = "get"
    operation_id = "CustomFields_getListFields"
    action_identifier = "/list/{list_id}/field_get"

    path_params = {"list_id": "list_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
