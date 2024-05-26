"""
File I/O tool for Composio.
"""

import typing as t
from pathlib import Path

from pydantic import BaseModel, Field


class Action:
    """Local action abstraction."""


class Tool:
    """Local tool abstraction."""


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


class ReadFile(Action):
    """Read file tool."""

    def read_file(self, request: ReadFileRequest) -> ReadFileResponse:
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


class WriteFile(Action):
    """Write file tool."""

    def execute(self, request: WriteFileRequest) -> WriteFileResponse:
        """
        Saves the contents to a file called `file_name` and returns the
        file name if successful.
        """
        try:
            file = Path(request.base_dir, request.filename)
            if not file.parent.exists():
                file.parent.mkdir(parents=True)
            if file.exists() and not request.overwrite:
                return WriteFileResponse(filename=f"File {file} already exists")
            file.write_text(request.contents, encoding="utf-8")
            return WriteFileResponse(filename=str(file))
        except Exception as e:  # pylint: disable=broad-exception-caught
            return WriteFileResponse(filename=f"Error saving to file: {e}")


class FileTool(Tool):
    """File I/O tool."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [ReadFile, WriteFile]
