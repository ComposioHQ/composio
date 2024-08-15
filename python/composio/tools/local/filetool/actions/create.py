from pydantic import Field, field_validator

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class CreateFileRequest(BaseFileRequest):
    """Request to create a file or directory."""

    path: str = Field(
        ...,
        description="""Path to create in the editor.
        If file/directory already exists, it will be overwritten""",
    )
    is_directory: bool = Field(
        False,
        description="Whether to create a directory instead of a file",
    )

    @field_validator("path")
    @classmethod
    def validate_path(cls, v: str) -> str:
        if v.strip() == "":
            raise ValueError("Path cannot be empty or just whitespace")
        if v in (".", ".."):
            raise ValueError('Path cannot be "." or ".."')
        return v


class CreateFileResponse(BaseFileResponse):
    """Response to create a file or directory."""

    path: str = Field(
        default=None,
        description="Path of the created file or directory.",
    )
    success: bool = Field(
        default=False,
        description="Whether the file or directory was created successfully",
    )


class CreateFile(BaseFileAction):
    """
    Creates a new file or directory within a shell session.
    Example:
        - To create a file or directory, provide the path of the new file/directory. If the path you provide
        is relative, it will be created relative to the current working directory.
        - Specify is_directory=True to create a directory instead of a file.
        - The response will indicate whether the file/directory was created successfully and list any errors.
    Raises:
        - ValueError: If the path is not a string or if the path is empty.
        - FileExistsError: If the file/directory already exists.
        - PermissionError: If the user does not have permission to create the file/directory.
        - FileNotFoundError: If the parent directory does not exist.
        - OSError: If an OS-specific error occurs.
    """

    _display_name = "Create a new file or directory"
    _request_schema = CreateFileRequest
    _response_schema = CreateFileResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: CreateFileRequest  # type: ignore
    ) -> CreateFileResponse:
        try:
            if request_data.is_directory:
                created_path = file_manager.create_directory(path=request_data.path)
            else:
                created_path = file_manager.create(path=request_data.path).path
            return CreateFileResponse(
                path=str(created_path),
                success=True,
            )
        except FileExistsError as e:
            return CreateFileResponse(error=f"File or directory already exists: {str(e)}")
        except PermissionError as e:
            return CreateFileResponse(error=f"Permission denied: {str(e)}")
        except FileNotFoundError as e:
            return CreateFileResponse(error=f"Parent directory does not exist: {str(e)}")
        except OSError as e:
            return CreateFileResponse(error=f"OS error occurred: {str(e)}")
