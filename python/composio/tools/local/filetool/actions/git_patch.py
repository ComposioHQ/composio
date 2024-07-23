import typing as t
from pathlib import Path

from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class GitPatchRequest(BaseFileRequest):
    """Request to get a Git patch."""

    new_file_paths: t.List[str] = Field(
        default=[],
        description="Paths of the files newly created to be included in the patch.",
    )


class GitPatchResponse(BaseFileResponse):
    """Response to getting a Git patch."""

    patch: str = Field("", description="The generated Git patch")


class GitPatch(BaseFileAction):
    """
    Get the patch from the current working directory.

    This action generates a Git patch that includes all changes in the current working directory,
    including newly created files specified in the request.

    The patch is in the format of a proper diff and includes deleted files by default.

    Usage example:
    new_file_paths: ["path/to/new/file1.txt", "path/to/new/file2.py"]

    The resulting patch will be in the format:
    diff --git a/repo/example.py b/repo/example.py
    index 1234567..89abcde 100644
    --- a/repo/example.py
    +++ b/repo/example.py
    @@ -1 +1 @@
    -Hello, World!
    +Hello, Composio!

    Note: This action should be run after all changes are made to add and check the result.
    """

    _display_name = "Get Git Patch"
    _request_schema = GitPatchRequest
    _response_schema = GitPatchResponse

    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: GitPatchRequest
    ) -> GitPatchResponse:
        try:
            # Ensure we're in a git repository
            if not Path(file_manager.working_dir, ".git").is_dir():
                raise ValueError("Not a git repository")

            # Add new files if specified
            if request_data.new_file_paths:
                for file_path in request_data.new_file_paths:
                    file_manager.execute_command(f"git add {file_path}")

            # Stage all changes
            file_manager.execute_command("git add -u")

            # Generate the patch
            patch, error = file_manager.execute_command("git diff --cached")

            if error:
                return GitPatchResponse(error=error, patch="")

            if not patch.strip():
                return GitPatchResponse(patch="No changes to commit.")

            return GitPatchResponse(patch=patch)
        except Exception as e:
            return GitPatchResponse(
                error=f"Error generating Git patch: {str(e)}",
                patch="No patch generated."
            )
