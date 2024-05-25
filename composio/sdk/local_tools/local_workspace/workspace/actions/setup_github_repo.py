import os
from pydantic.v1 import BaseModel, Field

from composio.sdk.local_tools.local_workspace.commons.get_logger import get_logger
from composio.sdk.local_tools.local_workspace.commons.local_docker_workspace import (WorkspaceManagerFactory,
get_workspace_meta_from_manager,
                                                                                        KEY_IMAGE_NAME,
                                                                                        KEY_CONTAINER_NAME,
                                                                                        KEY_WORKSPACE_MANAGER,
                                                                                        KEY_PARENT_PIDS)
from composio.sdk.local_tools.local_workspace.commons.utils import (communicate_with_handling,
                                                                    communicate,
                                                                    get_container_by_container_name,)
LONG_TIMEOUT = 200
logger = get_logger()


class SetupGithubRepoRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id to get the running workspace-manager")
    repo_name: str = Field(..., description="github repo-name for which issue needs to be solved")


class SetupGithubRepoResponse(BaseModel):
    github_repo_copy_resp: str = Field(..., description="response of github repo copy")


class SetupGithubRepo:
    """
    clones github repo in the workspace
    """
    _display_name = "Clone github repo on workspace"
    _request_schema = SetupGithubRepoRequest
    _response_schema = SetupGithubRepoResponse
    _tags = ["workspace"]
    workspace_factory: WorkspaceManagerFactory = None

    def _setup(self, args: SetupGithubRepoRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        self.repo_name = args.repo_name
        workspace_meta = get_workspace_meta_from_manager(self.workspace_factory, self.workspace_id)
        self.image_name = workspace_meta[KEY_IMAGE_NAME]
        self.container_name = workspace_meta[KEY_CONTAINER_NAME]
        self.container_process = workspace_meta[KEY_WORKSPACE_MANAGER]
        self.parent_pids = workspace_meta[KEY_PARENT_PIDS]
        self.container_obj = self.get_container_by_container_name()
        if not self.container_obj:
            raise Exception(f"container-name {self.container_name} is not a valid docker-container")
        self.logger = logger
        self._github_token = self.load_github_token_from_host_env()
        self.repo_type = "not_local"

    def get_container_by_container_name(self):
        container_obj = get_container_by_container_name(self.container_name, self.image_name)
        return container_obj

    def load_github_token_from_host_env(self):
        # Retrieve the token from an environment variable
        access_token = os.getenv('GITHUB_ACCESS_TOKEN')

        # Check if the token is available
        if access_token is None:
            raise ValueError("GitHub access token is not set in the environment variables")
        return access_token

    def reset(self):
        # Clone repository if not already cloned
        folders = communicate(self.container_process, self.container_obj, "ls", self.parent_pids).split("\n")
        if self.repo_name not in folders:
            raise Exception(f"repo name {self.repo_name} is not found in workspace")

        # Clean repository of any modifications + Checkout base commit
        for cmd in [
            f"cd {self.repo_name}",
            "export ROOT=$(pwd -P)",
        ]:
            communicate_with_handling(
                self.container_process,
                self.container_obj,
                cmd,
                self.parent_pids,
                error_msg="Failed to clean repository",
            )

    def set_workspace_factory(self, workspace_factory: WorkspaceManagerFactory):
        self.workspace_factory = workspace_factory

    def execute(self, request_data: _request_schema, authorisation_data: dict = {}):
        self._setup(request_data)
        token_prefix = ""
        if self._github_token:
            token_prefix = f"{self._github_token}@"
        communicate_with_handling(
            self.container_process, self.container_obj,
            f"git clone https://{token_prefix}github.com/{self.repo_name}.git",
            self.parent_pids,
            error_msg="Failed to clone repository from mirror",
            timeout_duration=LONG_TIMEOUT,
        )
        return SetupGithubRepoResponse(github_repo_copy_resp=f"repo: {self.repo_name} is cloned to container")