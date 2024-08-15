from pydantic import BaseModel, Field
from composio.tools.local.base import Action
import PyPDF2

class RequestSchema(BaseModel):
    pdf_path: str = Field(..., description="Path to the PDF file")

class ResponseSchema(BaseModel):
    text: str = Field(..., description="Extracted text from the PDF")

class ExtractText(Action[RequestSchema, ResponseSchema]):
    _display_name = "Extract Text"
    _request_schema = RequestSchema
    _response_schema = ResponseSchema
    _tags = ["pdf", "extract"]
    _tool_name = "pdfparser"

    def execute(self, request_data: RequestSchema, authorization_data: dict = {}) -> ResponseSchema:
        with open(request_data.pdf_path, "rb") as file:
            reader = PyPDF2.PdfReader(file)
            text = "".join([page.extract_text() for page in reader.pages])
        return ResponseSchema(text=text)
