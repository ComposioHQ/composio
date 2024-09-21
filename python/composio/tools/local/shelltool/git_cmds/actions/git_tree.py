from typing import Dict

from composio.tools.base.local import LocalAction
from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT
from composio.tools.local.shelltool.shell_exec.actions.exec import (
    ShellExecResponse,
    ShellRequest,
)


class GitRepoTree(LocalAction[ShellRequest, ShellExecResponse]):
    """
    Generate a tree of the repository. This command lists all files in
    the current commit across all directories. Returns a list of files
    with their relative paths in the codebase. It is useful to understand
    the file structure of the codebase and to find the relevant files for
    a given issue. The command writes the result to a file in current directory.
    Read the file 'git_repo_tree.txt' for getting the git-repo-tree results
    """

    _tags = ["cli"]

    def execute(self, request: ShellRequest, metadata: Dict) -> ShellExecResponse:
        output = self.shells.get(id=request.shell_id).exec(
            cmd="git ls-tree -r HEAD --name-only > ./git_repo_tree.txt",
        )
        if int(output[EXIT_CODE]) == 128:
            return ShellExecResponse(
                stdout=output[STDOUT],
                stderr=output[STDERR],
                exit_code=int(output[EXIT_CODE]),
            )
        return ShellExecResponse(
            stdout=(
                "Check git_repo_tree.txt for the git-repo-tree results. "
                "Use Open File function to check the file."
            ),
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )
