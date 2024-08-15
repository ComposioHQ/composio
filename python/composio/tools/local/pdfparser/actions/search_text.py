from pydantic import BaseModel, Field
from composio.tools.local.base import Action

class RequestSchema(BaseModel):
    text: str = Field(..., description="Extracted text")
    query: str = Field(..., description="Text to search for")

class ResponseSchema(BaseModel):
    found: bool = Field(..., description="Whether the text was found")
    position: int = Field(..., description="Position of the text found")

class SearchText(Action[RequestSchema, ResponseSchema]):
    _display_name = "Search Text"
    _request_schema = RequestSchema
    _response_schema = ResponseSchema
    _tags = ["pdf", "search"]
    _tool_name = "pdfparser"

    def execute(self, request_data: RequestSchema, authorization_data: dict = {}) -> ResponseSchema:
        position = request_data.text.find(request_data.query)
        found = position != -1
        return ResponseSchema(found=found, position=position if found else -1)
