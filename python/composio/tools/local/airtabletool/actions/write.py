import os

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class WriteAirtableRequest(BaseModel):
    base_id: str = Field(..., description="Airtable base ID, provided by the user")
    table_name: str = Field(
        ..., description="Name of the table to write to, provided by the user"
    )
    records: list = Field(
        ...,
        description="List of records to write, example: '[{'Name': 'John'}, {'Name': 'Marc'}]'",
    )


class WriteAirtableResponse(BaseModel):
    created_records: list = Field(..., description="List of created record IDs")


class Write(Action[WriteAirtableRequest, WriteAirtableResponse]):
    """
    Write records to an Airtable
    """

    _display_name = "Write to Airtable"
    _request_schema = WriteAirtableRequest
    _response_schema = WriteAirtableResponse
    _tags = ["Airtable"]
    _tool_name = "airtabletool"

    def execute(
        self, request_data: WriteAirtableRequest, authorisation_data: dict
    ) -> dict:
        """Write records to the specified Airtable"""
        try:
            # pylint: disable=import-outside-toplevel
            from pyairtable import Api

            # pylint: enable=import-outside-toplevel
        except ModuleNotFoundError as e:
            raise ModuleNotFoundError(
                "The 'pyairtable' package is required for using the airtable tool. Please install it using 'pip install pyairtable'."
            ) from e

        try:
            api_key = os.getenv("AIRTABLE_API_KEY")
            if not api_key:
                return {"error": "Airtable API key not provided"}

            api = Api(api_key=api_key)

            table = api.table(request_data.base_id, request_data.table_name)
            created_records = table.batch_create(request_data.records)
            return {"created_records": [record["id"] for record in created_records]}
        except Exception as e:
            return {"error": f"An unexpected error occurred: {e}"}
