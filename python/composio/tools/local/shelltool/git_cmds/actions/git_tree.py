from composio.tools.local.shelltool.shell_exec.actions.exec import (
    BaseExecCommand,
    ShellExecResponse,
    ShellRequest,
    exec_cmd,
)
from composio.tools.local.shelltool.utils import get_logger


logger = get_logger("workspace")


class GitRepoTree(BaseExecCommand):
    """
    Generate a tree of the repository. This command lists all files in the current commit across all directories.
    Returns a list of files with their relative paths in the codebase.
    It is useful to understand the file structure of the codebase and to find the relevant files for a given issue.
    The command writes the result to a file in current directory. Read the file 'git_repo_tree.txt' for getting the
    git-repo-tree results
    """

    _display_name = "Git repo tree action"
    _tool_name = "gitcmdtool"
    _request_schema = ShellRequest
    _response_schema = ShellExecResponse
    _output_text = "Check git_repo_tree.txt for the git-repo-tree results. Use Open File function to check the file."

    def execute(
        self, request_data: ShellRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        output = exec_cmd(
            cmd="git ls-tree -r HEAD --name-only > ./git_repo_tree.txt",
            authorisation_data=authorisation_data,
            shell_id=request_data.shell_id,
        )
        return ShellExecResponse(
            stdout="Check git_repo_tree.txt for the git-repo-tree results. Use Open File function to check the file.",
            stderr=output["stderr"],
        )
