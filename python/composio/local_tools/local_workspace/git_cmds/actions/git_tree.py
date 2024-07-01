from composio.local_tools.local_workspace.base_cmd import (
    BaseAction,
    BaseRequest,
    BaseResponse,
)
from composio.local_tools.local_workspace.utils import get_logger


logger = get_logger("workspace")


class GitRepoTree(BaseAction):
    """
    Generate a tree of the repository. This command lists all files in the current commit across all directories.
    Returns a list of files with their relative paths in the codebase.
    It is useful to understand the file structure of the codebase and to find the relevant files for a given issue.
    The command writes the result to a file in current directory. Read the file 'git_repo_tree.txt' for getting the
    git-repo-tree results
    """

    _display_name = "Git repo tree action"
    _tool_name = "gitcmdtool"
    _request_schema = BaseRequest
    _response_schema = BaseResponse
    _output_text = "Check git_repo_tree.txt for the git-repo-tree results. Use Open File function to check the file."

    def execute(
        self, request_data: BaseRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)
        cmd = "git ls-tree -r HEAD --name-only > ./git_repo_tree.txt"
        return self._communicate(cmd, output_text=self._output_text)
