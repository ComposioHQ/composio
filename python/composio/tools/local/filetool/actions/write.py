from typing import Dict

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


class WriteRequest(BaseFileRequest):
    """Request to write a file."""

    file_path: str = Field(
        default=None,
        description=(
            "The path to the file that will be edited. If not provided, "
            "THE CURRENTLY OPEN FILE will be edited. If provided, the "
            "file at the provided path will be OPENED and edited, changing "
            "the opened file."
        ),
    )
    text: str = Field(
        ...,
        description="The text that will replace the specified line range in the file.",
    )


class WriteResponse(BaseFileResponse):
    """Response to write a file."""

    error: str = Field(
        default="",
        description="Error message if any",
    )


class Write(LocalAction[WriteRequest, WriteResponse]):
    """
    Write the given content to a file.

    Note:
        This action will replace the existing content in the the file,
    and completetly rewrite the file, if you want to edit a specific portion
    of the file use `edit` tool instead.
    """

    @include_cwd  # type: ignore
    def execute(self, request: WriteRequest, metadata: Dict) -> WriteResponse:
        try:
            filemanager = self.filemanagers.get(request.file_manager_id)
            (
                filemanager.recent
                if request.file_path is None
                else filemanager.open(path=request.file_path)
            ).write(text=request.text)
            return WriteResponse()
        except FileNotFoundError as e:
            return WriteResponse(error=f"File not found: {str(e)}")
        except PermissionError as e:
            return WriteResponse(error=f"Permission denied: {str(e)}")
        except OSError as e:
            return WriteResponse(error=f"OS error occurred: {str(e)}")
