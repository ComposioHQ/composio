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
    github_token: str = Field(..., description="github token to clone the repository.")
    repo_name: str = Field(
        default="princeton-nlp/SWE-bench",
        description="github repository to clone. defaults to princeton-nlp/SWE-bench",
    )


class GithubCloneResponse(BaseResponse):
    pass


class GithubCloneCmd(BaseAction):
    """
    Clones a github repository
    """

    _history_maintains: bool = True
    _display_name = "Clone Github Repository Action"
    _request_schema = GithubCloneRequest
    _response_schema = GithubCloneResponse

    @history_recorder()
    def execute(
        self, request_data: GithubCloneRequest, authorisation_data: dict
    ) -> GithubCloneResponse:
        if not request_data.repo_name or not request_data.repo_name.strip():
            raise ValueError("repo_name can not be null. Give a repo_name to clone")

        if not request_data.github_token or not request_data.github_token.strip():
            raise ValueError("github_token can not be null")

        self._setup(request_data)

        if self.container_process is None:
            raise ValueError("Container process is not set")

        output, return_code = communicate(
            self.container_process,
            self.container_obj,
            f"git clone https://{request_data.github_token}@github.com/{request_data.repo_name}.git",
            self.parent_pids,
            timeout_duration=LONG_TIMEOUT,
        )
        output, return_code = process_output(output, return_code)
        return GithubCloneResponse(output=output, return_code=return_code)
