from typing import Dict

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.env.constants import EXIT_CODE, STDERR
from composio.tools.local.shelltool.shell_exec.actions.exec import (
    ShellExecResponse,
    ShellRequest,
)
from composio.tools.local.shelltool.utils import git_clone_cmd, git_reset_cmd


class GithubCloneRequest(ShellRequest):
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


class GithubCloneCmd(LocalAction[GithubCloneRequest, GithubCloneResponse]):
    """Clones a github repository at a given commit-id."""

    _tags = ["cli"]

    def execute(
        self, request: GithubCloneRequest, metadata: Dict
    ) -> GithubCloneResponse:
        cmd = (
            git_reset_cmd(request.commit_id)
            if request.just_reset
            else git_clone_cmd(request)
        )
        output = self.shells.get(id=request.shell_id).exec(cmd=cmd)
        return GithubCloneResponse(
            stdout=output[STDERR],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )
