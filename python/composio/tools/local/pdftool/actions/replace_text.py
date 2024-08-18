import typing as t
from pydantic import Field
from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)
import PyPDF2

class ReplaceTextRequest(BaseFileRequest):
    """Request to replace text in a PDF file."""

    file_path: str = Field(..., description="Path to the PDF file")
    find_text: str = Field(..., description="Text to find in the PDF file")
    replace_text: str = Field(..., description="Text to replace the found text with")

class ReplaceTextResponse(BaseFileResponse):
    """Response for replacing text in a PDF file."""

    message: str = Field(default="", description="Message to display to the user")
    error: str = Field(default="", description="Error message if any")

class ReplaceText(BaseFileAction):
    """
    Replaces text in a PDF file.

    This action allows you to replace specified text in a PDF file.
    """

    _display_name = "Replace Text in PDF"
    _request_schema = ReplaceTextRequest
    _response_schema = ReplaceTextResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: ReplaceTextRequest  # type: ignore
    ) -> ReplaceTextResponse:
        try:
            file = file_manager.open(request_data.file_path)
            if not file.is_file():
                return ReplaceTextResponse(error=f"File does not exist")

            # Read the PDF file
            with open(file, "rb") as read_only_file:
                reader = PyPDF2.PdfFileReader(read_only_file)
                writer = PyPDF2.PdfFileWriter()

                for page_num in range(reader.numPages):
                    page = reader.getPage(page_num)
                    text = page.extract_text()
                    if request_data.find_text in text:
                        text = text.replace(request_data.find_text, request_data.replace_text)
                        page.merge_text(text)
                    writer.addPage(page)

            # Save the modified PDF
            with open(file, "wb") as output_file:
                writer.write(output_file)

            return ReplaceTextResponse(message=f"Text replaced in the file")
        except Exception as e:
            return ReplaceTextResponse(error=str(e))