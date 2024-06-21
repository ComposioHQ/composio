import os

from pydantic import Field

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    communicate,
)
from composio.local_tools.local_workspace.commons.utils import process_output

from .base_class import BaseAction, BaseRequest, BaseResponse


LONG_TIMEOUT = 200
logger = get_logger()


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
    branch_name: str = Field(
        default="", description="if git repo needs to be cloned from a specific branch"
    )


class GithubCloneResponse(BaseResponse):
    pass


class GithubCloneCmd(BaseAction):
    """
    Clones a github repository at a given commit-id.
    """

    _history_maintains: bool = True
    _display_name = "Clone Github Repository Action"
    _request_schema = GithubCloneRequest
    _response_schema = GithubCloneResponse

    @history_recorder()
    def execute(
        self, request_data: GithubCloneRequest, authorisation_data: dict
    ) -> BaseResponse:
        if not request_data.repo_name or not request_data.repo_name.strip():
            raise ValueError("repo_name can not be null. Give a repo_name to clone")

        git_token = os.environ.get("GITHUB_ACCESS_TOKEN")
        if not git_token or not git_token.strip():
            raise ValueError("github_token can not be null")

        self._setup(request_data)

        if self.container_process is None:
            raise ValueError("Container process is not set")

        repo_name = request_data.repo_name
        repo_dir = repo_name.split("/")[-1].strip()
        git_clone_cmd = f"git clone https://{git_token}@github.com/{repo_name}.git"
        if request_data.branch_name and request_data.branch_name.strip():
            git_clone_cmd = f"git clone -b {request_data.branch_name}  https://{git_token}@github.com/{repo_name}.git"
        command_list = [
            git_clone_cmd,
            f"cd {repo_dir}",
        ]
        if request_data.commit_id:
            command_list.append(f"git reset --hard {request_data.commit_id}")
        self.command = " && ".join(command_list)

        output, return_code = communicate(
            self.container_process,
            self.container_obj,
            self.command,
            self.parent_pids,
            timeout_duration=LONG_TIMEOUT,
        )
        output, return_code = process_output(output, return_code)
        return BaseResponse(output=output, return_code=return_code)
