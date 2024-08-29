import typing as t
from typing import Optional, Literal
import requests
from pydantic import BaseModel, Field
from composio.tools.local.airtable.actions.base import OpenAPIAction



class ListRecordRequest(BaseModel):
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


class ListRecordResponse(BaseModel):
    """Response schema for `Airtable`"""

    data: t.Dict[str, t.Any] = Field(
        ...,
        description="Response data from Airtable API.",
    )


class ListRecords(OpenAPIAction[ListRecordRequest, ListRecordResponse]):
    """Perform an Airtable API request to list records."""

    _tags = ["Airtable"]
    _display_name = "list_airtable_records"
    _request_schema = ListRecordRequest
    _response_schema = ListRecordResponse

    url = "https://api.airtable.com/v0"
    path = "/{baseId}/{tableIdOrName}"
    method = "get"
    operation_id = "Airtable_listRecords"
    action_identifier = "/{baseId}/{tableIdOrName}_get"

    path_params = {
        "base_id": "baseId",
        "table_id_or_name": "tableIdOrName",
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

    def execute(self, request_data: ListRecordRequest, authorisation_data: dict) -> dict:
        if authorisation_data is None:
            authorisation_data = {}

        # Construct the URL
        url = f"{self.url}/{request_data.base_id}/{request_data.table_id_or_name}"

        # Prepare headers and query parameters
        headers = {
            "Authorization": authorisation_data.get("authorization_token", "")
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
