import typing as t
from pathlib import Path

from pydantic import Field

from composio.tools.base.exceptions import ExecutionFailed
from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


def git_apply_cmd(patch_path: str) -> str:
    """Commands to apply a patch."""
    return f"git apply --verbose {patch_path}"


class ApplyPatchRequest(BaseFileRequest):
    """Request to get a Git patch."""

    patch: str = Field("", description="The patch to apply")


class ApplyPatchResponse(BaseFileResponse):
    """Response to applying a patch."""

    message: str = Field("", description="The message from applying the patch")


class ApplyPatch(LocalAction[ApplyPatchRequest, ApplyPatchResponse]):
    """
    Apply a Git patch to the current working directory and perform lint checks.
    The patch should be in the format of a proper diff.

    Usage example:
    patch = "diff --git a/astropy/modeling/separable.py b/astropy/modeling/separable.py\n--- a/astropy/modeling/separable.py\n+++ b/astropy/modeling/separable.py\n@@ -242,7 +242,7 @@ def _cstack(left, right):\n         cright = _coord_matrix(right, 'right', noutp)\n     else:\n         cright = np.zeros((noutp, right.shape[1]))\n-        cright[-right.shape[0]:, -right.shape[1]:] = 1\n+        cright[-right.shape[0]:, -right.shape[1]:] = right\n \n     return np.hstack([cleft, cright])\n \n"

    This class is responsible for:
    1. Applying the patch using Git.
    2. Running lint checks on the affected files before and after applying the patch.
    3. Reverting changes if new lint errors are introduced.
    """  # noqa: E501

    display_name = "Apply Patch"
    _request_schema = ApplyPatchRequest
    _response_schema = ApplyPatchResponse

    @include_cwd  # type: ignore
    def execute(
        self,
        request: ApplyPatchRequest,
        metadata: t.Dict,
    ) -> ApplyPatchResponse:
        # Check if we're in a git repository or in a subdirectory of one
        file_manager = self.filemanagers.get(request.file_manager_id)
        git_root = self._find_git_root(file_manager.current_dir())
        if not git_root:
            raise ExecutionFailed("Not in a git repository or its subdirectories")

        with open(git_root / "patch.patch", "w", encoding="utf-8") as f:
            f.write(request.patch)

        files_to_be_modified, _ = self._get_files_from_patch(request.patch)
        before_lint, before_file_contents = self._run_lint_on_files(
            file_manager=file_manager,
            files=files_to_be_modified,
        )
        _, error = file_manager.execute_command(
            command=git_apply_cmd(
                patch_path=str(git_root / "patch.patch"),
            )
        )

        if error:
            raise ExecutionFailed(
                f"No Update, found error during applying patch: {error}"
            )

        after_lint, _ = self._run_lint_on_files(file_manager, files_to_be_modified)
        for key, value in before_lint.items():
            file = file_manager.open(path=key)
            new_lint_errors = (
                file._compare_lint_results(  # pylint: disable=protected-access
                    value,
                    after_lint[key],
                )
            )
            if len(new_lint_errors) > 0:
                formatted_errors = (
                    file._format_lint_errors(  # pylint: disable=protected-access
                        new_lint_errors,
                    )
                )
                file.path.write_text(before_file_contents[key], encoding="utf-8")
                raise ExecutionFailed(
                    f"No Update, found error during applying patch, no update made in the file: {formatted_errors}"
                )

        return ApplyPatchResponse(
            message="Successfully applied patch, lint checks passed"
        )

    def _find_git_root(self, path: str) -> t.Optional[Path]:
        """Find the root of the git repository."""
        current = Path(path).resolve()
        while current != current.parent:
            if (current / ".git").is_dir():
                return current
            current = current.parent
        return None

    def _get_files_from_patch(
        self, patch_content: str
    ) -> t.Tuple[t.List[str], t.Dict[str, t.Tuple[int, int]]]:
        """Extract the list of files that will be modified by the patch and their line ranges."""
        files = []
        line_ranges = {}
        current_file = None
        start_line = None
        for line in patch_content.splitlines():
            if line.startswith("+++") or line.startswith("---"):
                file_path = line.split()[1]
                if file_path != "/dev/null":
                    if file_path.startswith(("a/", "b/")):
                        file_path = file_path[2:]
                    files.append(file_path)
                    current_file = file_path
            elif line.startswith("@@"):
                if current_file:
                    line_info = line.split()[1].split(",")[0]
                    start_line = int(line_info.split("-")[1])
                    if current_file not in line_ranges:
                        line_ranges[current_file] = (start_line, start_line)
                    else:
                        line_ranges[current_file] = (
                            min(line_ranges[current_file][0], start_line),
                            max(line_ranges[current_file][1], start_line),
                        )
        return list(set(files)), line_ranges

    def _run_lint_on_files(
        self, file_manager, files: t.List[str]
    ) -> t.Tuple[t.Dict[str, t.List[str]], t.Dict[str, str]]:
        """Run lint on the given files."""
        lint_results = {}
        file_contents = {}
        for file_path in files:
            if file_path.endswith(".py"):
                file = file_manager.open(path=file_path)
                lint_results[file_path] = file.lint()
                file_contents[file_path] = file.path.read_text(encoding="utf-8")
        return lint_results, file_contents
