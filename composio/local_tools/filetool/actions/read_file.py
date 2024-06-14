from pathlib import Path
from typing import Type

from pydantic import BaseModel, Field

from composio.core.local import Action


class ReadFileRequest(BaseModel):
    """Read file request schema."""

    base_dir: str = Field(
        default=".",
        description="Directory where the file will be saved.",
    )
    filename: str = Field(
        ...,
        description="File name to be saved.",
    )


class ReadFileResponse(BaseModel):
    """Read file response schema."""

    contents: str = Field(
        ...,
        description="Content read from the file.",
    )


class ReadFile(Action[ReadFileRequest, ReadFileResponse]):
    """Read file tool."""

    _display_name = "Read file"
    _description = "Read file from a file."
    _request_schema: Type[ReadFileRequest] = ReadFileRequest
    _response_schema: Type[ReadFileResponse] = ReadFileResponse
    _tags = ["file", "read"]
    _tool_name = "filetool"

    def execute(
        self, request: ReadFileRequest, authorisation_data: dict
    ) -> ReadFileResponse:
        """
        Reads the contents of the file `file_name` and returns the contents
        if successful.
        """
        try:
            return ReadFileResponse(
                contents=Path(request.base_dir, request.filename).read_text(
                    encoding="utf-8"
                )
            )
        except Exception as e:  # pylint: disable=broad-exception-caught
            return ReadFileResponse(contents=f"Error reading file: {e}")
