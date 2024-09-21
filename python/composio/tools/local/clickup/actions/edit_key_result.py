import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class EditKeyResultRequest(BaseModel):
    """Request schema for `EditKeyResult`"""

    key_result_id: str = Field(
        ...,
        alias="key_result_id",
        description="8480-49bc-8c57-e569747efe93 (uuid)",
    )
    steps_current: int = Field(
        default=...,
        alias="steps_current",
        description="Steps Current",
    )
    note: str = Field(
        default=...,
        alias="note",
        description="Note",
    )


class EditKeyResultResponse(BaseModel):
    """Response schema for `EditKeyResult`"""

    data: t.Dict[str, t.Any]


class EditKeyResult(OpenAPIAction):
    """Update a Target."""

    _tags = ["Goals"]
    _display_name = "edit_key_result"
    _request_schema = EditKeyResultRequest
    _response_schema = EditKeyResultResponse

    url = "https://api.clickup.com/api/v2"
    path = "/key_result/{key_result_id}"
    method = "put"
    operation_id = "Goals_updateKeyResult"
    action_identifier = "/key_result/{key_result_id}_put"

    path_params = {"key_result_id": "key_result_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "steps_current": {"__alias": "steps_current"},
        "note": {"__alias": "note"},
    }

    aliases = {}
