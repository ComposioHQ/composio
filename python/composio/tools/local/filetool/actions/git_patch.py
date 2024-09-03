import typing as t
from pathlib import Path

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
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


class GitPatch(LocalAction[GitPatchRequest, GitPatchResponse]):
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

    display_name = "Get Git Patch"
    _request_schema = GitPatchRequest
    _response_schema = GitPatchResponse

    @include_cwd  # type: ignore
    def execute(self, request: GitPatchRequest, metadata: t.Dict) -> GitPatchResponse:
        # Check if we're in a git repository or in a subdirectory of one
        file_manager = self.filemanagers.get(request.file_manager_id)
        git_root = self._find_git_root(file_manager.current_dir())
        if not git_root:
            return GitPatchResponse(
                error="Not in a git repository or its subdirectories", patch=""
            )

        # Change to the git root directory
        original_dir = file_manager.current_dir()
        file_manager.chdir(str(git_root))

        # Add new files if specified
        if request.new_file_paths:
            for file_path in request.new_file_paths:
                relative_path = Path(original_dir) / file_path
                git_relative_path = relative_path.relative_to(git_root)
                _, error = file_manager.execute_command(f"git add {git_relative_path}")
                if error:
                    file_manager.chdir(original_dir)
                    return GitPatchResponse(
                        error=f"Error adding new file: {error}", patch=""
                    )

        # Stage all changes
        _, error = file_manager.execute_command("git add -u")
        if error:
            file_manager.chdir(original_dir)
            return GitPatchResponse(error=f"Error staging changes: {error}", patch="")

        # Generate the patch
        patch, error = file_manager.execute_command("git diff --cached")

        # Change back to the original directory
        file_manager.chdir(original_dir)
        if error:
            return GitPatchResponse(error=f"Error generating patch: {error}", patch="")
        return GitPatchResponse(patch=patch)

    def _find_git_root(self, path: str) -> t.Optional[Path]:
        """Find the root of the git repository."""
        current = Path(path).resolve()
        while current != current.parent:
            if (current / ".git").is_dir():
                return current
            current = current.parent
        return None
