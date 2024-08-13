import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteKeyResultRequest(BaseModel):
    """Request schema for `DeleteKeyResult`"""

    key_result_id: str = Field(
        ...,
        alias="key_result_id",
        description="8480-49bc-8c57-e569747efe93 (uuid)",
    )


class DeleteKeyResultResponse(BaseModel):
    """Response schema for `DeleteKeyResult`"""

    data: t.Dict[str, t.Any]


class DeleteKeyResult(OpenAPIAction):
    """Delete a target from a Goal."""

    _tags = ["Goals"]
    _display_name = "delete_key_result"
    _request_schema = DeleteKeyResultRequest
    _response_schema = DeleteKeyResultResponse

    url = "https://api.clickup.com/api/v2"
    path = "/key_result/{key_result_id}"
    method = "delete"
    operation_id = "Goals_removeTarget"
    action_identifier = "/key_result/{key_result_id}_delete"

    path_params = {"key_result_id": "key_result_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
