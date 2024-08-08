import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteViewRequest(BaseModel):
    """Request schema for `DeleteView`"""

    view_id: str = Field(
        ...,
        alias="view_id",
        description="105 (string)",
    )


class DeleteViewResponse(BaseModel):
    """Response schema for `DeleteView`"""

    data: t.Dict[str, t.Any]


class DeleteView(OpenAPIAction):
    """
    Deletes a specific View by its ID. Requires 'view_id' as a string parameter
    in the path. Successful deletion returns 200 with an empty JSON object.
    """

    _tags = ["Views"]
    _display_name = "delete_view"
    _request_schema = DeleteViewRequest
    _response_schema = DeleteViewResponse

    url = "https://api.clickup.com/api/v2"
    path = "/view/{view_id}"
    method = "delete"
    operation_id = "Views_deleteViewById"
    action_identifier = "/view/{view_id}_delete"

    path_params = {"view_id": "view_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
