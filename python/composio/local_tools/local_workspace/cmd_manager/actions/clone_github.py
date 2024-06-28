import os

from pydantic import Field

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
        if request_data.just_reset:
            print("Resetting repository to base commit")
            self.reset_to_base_commit(request_data)
            return BaseResponse(output="Repository reset to base commit", return_code=0)

        git_token = os.environ.get("GITHUB_ACCESS_TOKEN")
        if not git_token or not git_token.strip():
            raise ValueError("github_token can not be null")

        self._setup(request_data)

        repo_dir = request_data.repo_name.split("/")[-1].strip()
        command_list = [
            f"git clone https://{git_token}@github.com/{request_data.repo_name}.git",
            f"cd {repo_dir}",
        ]
        if request_data.commit_id:
            command_list.append(f"git reset --hard {request_data.commit_id}")
        self.command = " && ".join(command_list)

        cmd_response: BaseCmdResponse = self.workspace.communicate(self.command, timeout=LONG_TIMEOUT)
        output, return_code = process_output(cmd_response.output, cmd_response.return_code)
        return BaseResponse(output=output, return_code=return_code)

    def reset_to_base_commit(self, request_data: GithubCloneRequest) -> None:
        """
        Resets the repository to the specified base commit and cleans any untracked files or changes.
        Assumes the repository already exists as cloned by the execute function.
        """
        print("Resetting repository to base commit inside reset_to_base_commit")
        self._setup(request_data)
        reset_commands = [
            "git remote get-url origin",
            "git fetch --all",
            f"git reset --hard {request_data.commit_id}",
            "git clean -fdx",
        ]

        print("Resetting repository to base commit checked container process")
        reset_command = " && ".join(reset_commands)
        cmd_response: BaseCmdResponse = self.workspace.communicate(self.command, timeout=LONG_TIMEOUT)
        print(f"Resetting repository to base commit output: {cmd_response.output}")
        if cmd_response.return_code != 0:
            raise RuntimeError(f"Failed to reset repository: {cmd_response.output}")
        print("Repository successfully reset to base commit and cleaned.")
