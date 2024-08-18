import typing as t
from pydantic import Field
from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)
import PyPDF2

class MergePDFsRequest(BaseFileRequest):
    """Request to merge multiple PDF files."""

    file_paths: t.List[str] = Field(..., description="List of PDF file paths to merge")
    output_path: str = Field(..., description="Path to save the merged PDF file")

class MergePDFsResponse(BaseFileResponse):
    """Response for merging PDF files."""

    message: str = Field(default="", description="Message to display to the user")
    error: str = Field(default="", description="Error message if any")

class MergePDFs(BaseFileAction):
    """
    Merges multiple PDF files into a single PDF file.

    This action allows you to merge multiple PDF files into one.
    """

    _display_name = "Merge PDFs"
    _request_schema = MergePDFsRequest
    _response_schema = MergePDFsResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: MergePDFsRequest  # type: ignore
    ) -> MergePDFsResponse:
        try:
            output_path = file_manager.working_dir / request_data.output_path
            pdf_writer = PyPDF2.PdfFileWriter()

            for file_path in request_data.file_paths:
                full_path = file_manager.working_dir / file_path
                if not full_path.exists():
                    return MergePDFsResponse(error=f"File {full_path} does not exist")

                with open(full_path, "rb") as file:
                    reader = PyPDF2.PdfFileReader(file)
                    for page_num in range(reader.numPages):
                        pdf_writer.addPage(reader.getPage(page_num))

            with open(output_path, "wb") as output_file:
                pdf_writer.write(output_file)

            return MergePDFsResponse(message=f"Merged PDF saved to {output_path}")
        except Exception as e:
            return MergePDFsResponse(error=str(e))