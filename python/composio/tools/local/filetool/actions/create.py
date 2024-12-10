from typing import Dict, Optional

from pydantic import Field, field_validator

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
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

    path: Optional[str] = Field(
        default=None,
        description="Path of the created file or directory.",
    )


class CreateFile(LocalAction[CreateFileRequest, CreateFileResponse]):
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

    @include_cwd  # type: ignore
    def execute(self, request: CreateFileRequest, metadata: Dict) -> CreateFileResponse:
        if request.is_directory:
            return CreateFileResponse(
                path=str(
                    self.filemanagers.get(
                        request.file_manager_id,
                    ).create_directory(
                        path=request.path,
                    )
                ),
            )

        return CreateFileResponse(
            path=str(
                self.filemanagers.get(request.file_manager_id)
                .create(path=request.path)
                .path
            )
        )
