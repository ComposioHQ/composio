from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
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


class Write(BaseFileAction):
    """
    Write the given content to a file.

    Note:
        This action will replace the existing content in the the file,
    and completetly rewrite the file, if you want to edit a specific portion
    of the file use `edit` tool instead.
    """

    _display_name = "Edit a file"
    _request_schema = WriteRequest
    _response_schema = WriteResponse

    def execute_on_file_manager(
        self,
        file_manager: FileManager,
        request_data: WriteRequest,  # type: ignore
    ) -> WriteResponse:
        try:
            (
                file_manager.recent
                if request_data.file_path is None
                else file_manager.open(
                    path=request_data.file_path,
                )
            ).write(text=request_data.text)
            return WriteResponse()
        except FileNotFoundError as e:
            return WriteResponse(error=f"File not found: {str(e)}")
        except PermissionError as e:
            return WriteResponse(error=f"Permission denied: {str(e)}")
        except OSError as e:
            return WriteResponse(error=f"OS error occurred: {str(e)}")
