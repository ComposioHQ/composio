from pydantic import Field

from composio.local_tools.local_workspace.cmd_manager.actions.const import (
    git_clone_cmd,
    git_reset_cmd,
)
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.utils import process_output
from composio.workspace.base_workspace import BaseCmdResponse

from .base_class import BaseAction, BaseRequest, BaseResponse


LONG_TIMEOUT = 200
logger = get_logger("workspace")


class GithubCloneRequest(BaseRequest):
    workspace_id: str = Field(
        ..., description="workspace id on which to clone the repo"
    )
    repo_name: str = Field(
        ...,
        description="github repository to clone",
    )
    commit_id: str = Field(
        "",
        description="after cloning the git repo, repo will be set to this commit-id."
        "if commit-id is empty, default branch of the repo will be cloned",
    )
    just_reset: bool = Field(
        False,
        description="If true, the repo will not be cloned. It will be assumed to exist. "
        "The repo will be cleaned and reset to the given commit-id",
    )


class GithubCloneResponse(BaseResponse):
    pass


class GithubCloneCmd(BaseAction):
    """
    Clones a github repository at a given commit-id.
    """

    runs_on_workspace: bool = True
    _display_name = "Clone Github Repository Action"
    _request_schema = GithubCloneRequest
    _response_schema = GithubCloneResponse

    def execute(
        self, request_data: GithubCloneRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)
        if request_data.just_reset:
            return self.reset_to_base_commit(request_data)
        return self._communicate(git_clone_cmd(request_data), timeout=LONG_TIMEOUT)

    def reset_to_base_commit(self, request_data: GithubCloneRequest) -> BaseResponse:
        """
        Resets the repository to the specified base commit and cleans any untracked files or changes.
        Assumes the repository already exists as cloned by the execute function.
        """
        print("Resetting repository to base commit inside reset_to_base_commit")
        if self.workspace is None:
            raise RuntimeError("Workspace is not set")
        cmd_response: BaseCmdResponse = self.workspace.record_history_and_communicate(
            git_reset_cmd(request_data.commit_id), timeout=LONG_TIMEOUT
        )
        if cmd_response.return_code != 0:
            raise RuntimeError(f"Failed to reset repository: {cmd_response.output}")
        return BaseResponse(output="Repository reset to base commit", return_code=0)
