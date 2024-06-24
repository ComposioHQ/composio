from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    communicate,
)
from composio.local_tools.local_workspace.commons.utils import process_output

from .base_class import BaseAction, BaseRequest, BaseResponse
from .const import SCRIPT_EDIT_LINTING


logger = get_logger()


class GitRepoTree(BaseAction):
    """
    Generate a tree of the repository. This command lists all files in the current commit across all directories.
    Returns a list of files with their relative paths in the codebase.
    It is useful to understand the file structure of the codebase and to find the relevant files for a given issue.
    The command writes the result to a file in current directory. Read the file 'git_repo_tree.txt' for getting the
    git-repo-tree results
    """

    _display_name = "Git repo tree action"
    _request_schema = BaseRequest
    _response_schema = BaseResponse

    @history_recorder()
    def execute(
        self, request_data: BaseRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)
        self.script_file = SCRIPT_EDIT_LINTING
        self.command = "git ls-tree -r HEAD --name-only > ./git_repo_tree.txt"
        if self.container_process is None:
            raise ValueError("Container process is not set")

        output, return_code = communicate(
            self.container_process, self.container_obj, self.command, self.parent_pids
        )
        output, return_code = process_output(output, return_code)
        return BaseResponse(
            output="Check git_repo_tree.txt for the git-repo-tree results. Use Open File function to check the file.",
            return_code=return_code,
        )
