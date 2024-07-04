from composio.tools.local.shelltool.shell_exec.actions.exec import (
    ExecuteCommand,
    ShellExecRequest,
    ShellExecResponse,
)
from composio.tools.local.shelltool.utils import get_logger


logger = get_logger("workspace")


class GitRepoTree(ExecuteCommand):
    """
    Generate a tree of the repository. This command lists all files in the current commit across all directories.
    Returns a list of files with their relative paths in the codebase.
    It is useful to understand the file structure of the codebase and to find the relevant files for a given issue.
    The command writes the result to a file in current directory. Read the file 'git_repo_tree.txt' for getting the
    git-repo-tree results
    """

    _display_name = "Git repo tree action"
    _tool_name = "gitcmdtool"
    _request_schema = ShellExecRequest
    _response_schema = ShellExecResponse
    _output_text = "Check git_repo_tree.txt for the git-repo-tree results. Use Open File function to check the file."

    def execute(
        self, request_data: ShellExecRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        self._setup(request_data)
        cmd = "git ls-tree -r HEAD --name-only > ./git_repo_tree.txt"
        return self._communicate(cmd, output_text=self._output_text)
