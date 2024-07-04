from pydantic import Field

from composio.tools.local.shelltool.shell_exec.actions.exec import (
    ExecuteCommand,
    ShellExecRequest,
    ShellExecResponse,
)
from composio.tools.local.shelltool.utils import (
    get_logger,
    git_clone_cmd,
    git_reset_cmd,
)


LONG_TIMEOUT = 200
logger = get_logger("workspace")


class GithubCloneRequest(ShellExecRequest):
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


class GithubCloneResponse(ShellExecResponse):
    pass


class GithubCloneCmd(ExecuteCommand):
    """
    Clones a github repository at a given commit-id.
    """

    _display_name = "Clone Github Repository Action"
    _tool_name = "gitcmdtool"
    _request_schema = GithubCloneRequest
    _response_schema = GithubCloneResponse

    def execute(
        self, request_data: ShellExecRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        request_data = GithubCloneRequest(**request_data.model_dump())
        self._setup(request_data)
        if request_data.just_reset:
            return self.reset_to_base_commit(request_data)
        return self._communicate(git_clone_cmd(request_data), timeout=LONG_TIMEOUT)

    def reset_to_base_commit(
        self, request_data: GithubCloneRequest
    ) -> ShellExecResponse:
        """
        Resets the repository to the specified base commit and cleans any untracked files or changes.
        Assumes the repository already exists as cloned by the execute function.
        """
        logger.info("Resetting repository to base commit inside reset_to_base_commit")
        self._communicate(git_reset_cmd(request_data.commit_id), timeout=LONG_TIMEOUT)
        return ShellExecResponse(
            output="Repository reset to base commit", return_code=0
        )
