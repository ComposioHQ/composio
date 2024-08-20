import PyPDF2
from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class PdfParserRequest(BaseModel):
    pdf_path: str = Field(..., description="Path to the PDF file.")


class PdfParserResponse(BaseModel):
    text: str = Field(..., description="Extracted text from the PDF.")


class PdfTextExtractor(Action[PdfParserRequest, PdfParserResponse]):
    """
    Extracts text from a PDF file.
    """

    _display_name = "Parse a PDF"
    _request_schema = PdfParserRequest
    _response_schema = PdfParserResponse
    _tags = ["pdf", "text extraction"]
    _tool_name = "pdf_tool"

    def execute(self, request_data: PdfParserRequest, authorisation_data: dict) -> dict:
        if authorisation_data is None:
            authorisation_data = {}
        pdf_path = request_data.model_dump()["pdf_path"]
        try:
            with open(pdf_path, "rb") as file:
                reader = PyPDF2.PdfReader(file)
                text = ""
                for page_num in range(len(reader.pages)):
                    text += reader.pages[page_num].extract_text()
            execution_details = {"executed": True}
            response_data = {"text": text}
        except Exception as e:
            execution_details = {"executed": False}
            response_data = {"error": str(e)}

        return {"execution_details": execution_details, "response_data": response_data}
