import typing as t
from pathlib import Path

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


def git_apply_cmd(patch_path: str) -> str:
    """Commands to apply a patch."""
    return f"git apply {patch_path}"


class ApplyPatchRequest(BaseFileRequest):
    """Request to get a Git patch."""

    patch: str = Field("", description="The patch to apply")


class ApplyPatchResponse(BaseFileResponse):
    """Response to applying a patch."""

    message: str = Field("", description="The message from applying the patch")
    error: str = Field("", description="The error from applying the patch")


class ApplyPatch(LocalAction[ApplyPatchRequest, ApplyPatchResponse]):
    """
    Apply a patch to the current working directory.

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

    display_name = "Apply Patch"
    _request_schema = ApplyPatchRequest
    _response_schema = ApplyPatchResponse

    @include_cwd
    def execute(
        self, request: ApplyPatchRequest, metadata: t.Dict
    ) -> ApplyPatchResponse:
        # Check if we're in a git repository or in a subdirectory of one
        file_manager = self.filemanagers.get(request.file_manager_id)
        git_root = self._find_git_root(file_manager.current_dir())
        if not git_root:
            return ApplyPatchResponse(
                error="Not in a git repository or its subdirectories"
            )
        with open(git_root / "patch.patch", "w") as f:
            f.write(request.patch)

        output, error = file_manager.execute_command(
            git_apply_cmd(git_root / "patch.patch")
        )

        if error:
            return ApplyPatchResponse(
                error="No Update, found error during applying patch: " + error,
            )

        return ApplyPatchResponse(
            message=output,
            error="",
        )

    def _find_git_root(self, path: str) -> t.Optional[Path]:
        """Find the root of the git repository."""
        current = Path(path).resolve()
        while current != current.parent:
            if (current / ".git").is_dir():
                return current
            current = current.parent
        return None
