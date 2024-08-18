import typing as t
from pydantic import Field
from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)
import PyPDF2

class ExtractTextRequest(BaseFileRequest):
    """Request to extract text from a PDF file."""

    file_path: str = Field(..., description="Path to the PDF file")

class ExtractTextResponse(BaseFileResponse):
    """Response for text extraction from a PDF file."""

    text: str = Field(default="", description="Extracted text from the PDF file")
    pages: int = Field(default=0, description="Number of pages in the extracted text")
    error: str = Field(default="", description="Error message if any")

class ExtractText(BaseFileAction):
    """
    Extracts text from a PDF file.

    This action allows you to extract text from a specified PDF file.
    """

    _display_name = "Extract Text from PDF"
    _request_schema = ExtractTextRequest
    _response_schema = ExtractTextResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: ExtractTextRequest  # type: ignore
    ) -> ExtractTextResponse:
        try:
            file = file_manager.open(request_data.file_path)
            if not file.is_file():
                return ExtractTextResponse(error=f"File does not exist")

            with open(file, "rb") as read_only_file:
                reader = PyPDF2.PdfFileReader(read_only_file)
                text = ""
                pages = reader.numPages
                for page_num in range(reader.numPages):
                    text += reader.getPage(page_num).extract_text()

            return ExtractTextResponse(text=text, pages=pages);
        except Exception as e:
            return ExtractTextResponse(error=str(e))