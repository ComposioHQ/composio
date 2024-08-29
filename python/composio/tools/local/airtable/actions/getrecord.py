import typing as t
from typing import Optional, Literal
from pydantic import BaseModel, Field
import requests
from composio.tools.local.airtable.actions.base import OpenAPIAction

class GetRecordRequest(BaseModel):
    """Request schema for `Airtable`"""

    base_id: str = Field(
        ...,
        alias="baseId",
        description="Base ID for the Airtable workspace.",
    )
    table_id_or_name: str = Field(
        ...,
        alias="tableIdOrName",
        description="Table ID or Name in the Airtable base.",
    )
    record_id: str = Field(
        ...,
        alias="recordId",
        description="Record ID to be accessed in the specified table.",
    )
    cell_format: Optional[Literal["json", "string"]] = Field(
        default="json",
        alias="cellFormat",
        description="The format that should be used for cell values.",
    )
    return_fields_by_field_id: Optional[bool] = Field(
        default=False,
        alias="returnFieldsByFieldId",
        description="If true, returns field objects where the key is the field id instead of the field name.",
    )
    authorization_token: str = Field(
        ...,
        alias="Authorization",
        description="Bearer token for authorization.",
    )

class GetRecordResponse(BaseModel):
    """Response schema for `Airtable`"""

    id: str = Field(
        ...,
        description="Record ID",
    )
    created_time: str = Field(
        ...,
        alias="createdTime",
        description="A date timestamp in the ISO format, e.g., '2018-01-01T00:00:00.000Z'.",
    )
    fields: t.Dict[str, t.Any] = Field(
        ...,
        description="Cell values keyed by either field name or field ID.",
    )

class GetRecord(OpenAPIAction):
    """Perform an Airtable API request to get a record."""

    _display_name = "Get Airtable Record"
    _request_schema = GetRecordRequest
    _response_schema = GetRecordResponse
    _tags = ["Airtable"]
    _tool_name = "airtable_tool"

    url = "https://api.airtable.com/v0"
    path = "/{baseId}/{tableIdOrName}/{recordId}"
    method = "get"
    operation_id = "Airtable_getRecord"
    action_identifier = "/{baseId}/{tableIdOrName}/{recordId}_get"

    path_params = {
        "base_id": "baseId",
        "table_id_or_name": "tableIdOrName",
        "record_id": "recordId"
    }
    query_params = {
        "cell_format": {"__alias": "cellFormat"},
        "return_fields_by_field_id": {"__alias": "returnFieldsByFieldId"}
    }
    header_params = {
        "authorization_token": {"__alias": "Authorization"}
    }
    request_params = {}

    aliases = {}

    def execute(self, request_data: GetRecordRequest, authorisation_data: dict) -> dict:
        if authorisation_data is None:
            authorisation_data = {}

        # Construct the URL
        url = f"{self.url}/{request_data.base_id}/{request_data.table_id_or_name}/{request_data.record_id}"

        # Prepare headers and query parameters
        headers = {
            "Authorization": request_data.authorization_token
        }
        params = {
            "cellFormat": request_data.cell_format,
            "returnFieldsByFieldId": str(request_data.return_fields_by_field_id).lower()
        }

        try:
            # Make the GET request to Airtable API
            response = requests.get(url, headers=headers, params=params)

            # Handle response
            if response.status_code == 200:
                response_data = response.json()
                execution_details = {"executed": True}
            else:
                response_data = {"error": response.text}
                execution_details = {"executed": False}
        except Exception as e:
            execution_details = {"executed": False}
            response_data = {"error": str(e)}

        return {"execution_details": execution_details, "response_data": response_data}
