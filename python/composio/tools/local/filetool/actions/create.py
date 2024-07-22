from pydantic import Field, field_validator

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class CreateFileRequest(BaseFileRequest):
    """Request to create a file."""

    file_path: str = Field(
        ...,
        description="""File path to create in the editor.
        If file already exists, it will be overwritten""",
    )

    @field_validator("file_path")
    @classmethod
    def validate_file_path(cls, v: str) -> str:
        if v.strip() == "":
            raise ValueError("File name cannot be empty or just whitespace")
        if v in (".", ".."):
            raise ValueError('File name cannot be "." or ".."')
        return v


class CreateFileResponse(BaseFileResponse):
    """Response to create a file."""

    file: str = Field(
        default=None,
        description="Path the created file.",
    )
    success: bool = Field(
        default=False,
        description="Whether the file was created successfully",
    )


class CreateFile(BaseFileAction):
    """
    Creates a new file within a shell session.
    Example:
        - To create a file, provide the path of the new file. If the path you provide
        is relative, it will be created relative to the current working directory.
        - The response will indicate whether the file was created successfully and list any errors.
    Raises:
        - ValueError: If the file path is not a string or if the file path is empty.
        - FileExistsError: If the file already exists.
        - PermissionError: If the user does not have permission to create the file.
        - FileNotFoundError: If the directory does not exist.
        - OSError: If an OS-specific error occurs.
    """

    _display_name = "Create a new file"
    _request_schema = CreateFileRequest
    _response_schema = CreateFileResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: CreateFileRequest  # type: ignore
    ) -> CreateFileResponse:
        try:
            return CreateFileResponse(
                file=str(
                    file_manager.create(
                        path=request_data.file_path,
                    ).path
                ),
                success=True,
            )
        except FileExistsError as e:
            return CreateFileResponse(error=f"File already exists: {str(e)}")
        except PermissionError as e:
            return CreateFileResponse(error=f"Permission denied: {str(e)}")
        except FileNotFoundError as e:
            return CreateFileResponse(error=f"Directory does not exist: {str(e)}")
        except OSError as e:
            return CreateFileResponse(error=f"OS error occurred: {str(e)}")
