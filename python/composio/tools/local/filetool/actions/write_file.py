from pathlib import Path

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class WriteFileRequest(BaseModel):
    """Safe file request schema."""

    base_dir: str = Field(
        default=".",
        description="Directory where the file will be saved.",
    )
    contents: str = Field(
        ...,
        description="Content to write in the file.",
    )
    filename: str = Field(
        ...,
        description="File name to be saved.",
    )
    overwrite: bool = Field(
        ...,
        description="Whether to overwrite a file if it exists or not.",
    )


class WriteFileResponse(BaseModel):
    """Save file response schema."""

    filename: str = Field(
        ...,
        description="Path of the saved file.",
    )


class WriteFile(Action[WriteFileRequest, WriteFileResponse]):
    """Write file tool."""

    _display_name = "Write file"
    _request_schema = WriteFileRequest
    _response_schema = WriteFileResponse
    _tags = ["file", "write"]
    _tool_name = "filetool"

    def execute(self, request_data: WriteFileRequest, authorisation_data: dict) -> WriteFileResponse:  # type: ignore[override]
        """
        Saves the contents to a file called `file_name` and returns the
        file name if successful.
        """
        try:
            file = Path(request_data.base_dir, request_data.filename)
            if not file.parent.exists():
                file.parent.mkdir(parents=True)
            if file.exists() and not request_data.overwrite:
                return WriteFileResponse(filename=f"File {file} already exists")
            file.write_text(request_data.contents, encoding="utf-8")
            return WriteFileResponse(filename=str(file))
        except Exception as e:  # pylint: disable=broad-exception-caught
            return WriteFileResponse(filename=f"Error saving to file: {e}")
