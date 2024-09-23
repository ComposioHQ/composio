import os

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class GetSchemaRequest(BaseModel):
    base_id: str = Field(..., description="Airtable base ID, provided by the user")
    table_name: str = Field(
        ..., description="Name of the table to get schema from, provided by the user"
    )


class GetSchemaResponse(BaseModel):
    schema: dict = Field(
        ..., description="See the structure of a base, like table names or field types"
    )


class GetSchema(Action[GetSchemaRequest, GetSchemaResponse]):
    """
    Get the schema of an Airtable table
    """

    _display_name = "Get Airtable Schema"
    _request_schema = GetSchemaRequest
    _response_schema = GetSchemaResponse
    _tags = ["Airtable"]
    _tool_name = "airtabletool"

    def execute(self, request_data: GetSchemaRequest, authorisation_data: dict) -> dict:
        """Get the schema of the specified Airtable table"""
        try:
            from pyairtable import Api
        except ModuleNotFoundError as e:
            raise ModuleNotFoundError(
                "The 'pyairtable' package is required for using the airtable tool. Please install it using 'pip install pyairtable'."
            ) from e

        api_key = os.getenv("AIRTABLE_API_KEY")
        if not api_key:
            raise ValueError("AIRTABLE_API_KEY environment variable is not set")

        api = Api(api_key)
        table = api.table(request_data.base_id, request_data.table_name)

        schema = table.schema()
        return {"schema": schema}
