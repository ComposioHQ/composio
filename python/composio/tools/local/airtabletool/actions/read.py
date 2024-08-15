import os

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class ReadAirtableRequest(BaseModel):
    base_id: str = Field(..., description="Airtable base ID, provided by the user")
    table_name: str = Field(
        ..., description="Name of the table to read from, provided by the user"
    )


class ReadAirtableResponse(BaseModel):
    records: list = Field(..., description="List of records from the Airtable")


class Read(Action[ReadAirtableRequest, ReadAirtableResponse]):
    """
    Read records from an Airtable
    """

    _display_name = "Read from Airtable"
    _request_schema = ReadAirtableRequest
    _response_schema = ReadAirtableResponse
    _tags = ["Airtable"]
    _tool_name = "airtabletool"

    def execute(
        self, request_data: ReadAirtableRequest, authorisation_data: dict
    ) -> dict:
        """Read records from the specified Airtable"""
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
            records = table.all()
            return {"records": records}
        except Exception as e:
            return {"error": f"An unexpected error occurred: {e}"}
