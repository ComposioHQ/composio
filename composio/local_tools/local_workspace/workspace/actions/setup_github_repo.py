import os

from pydantic import BaseModel, Field

from composio.local_tools.action import Action
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    KEY_CONTAINER_NAME,
    KEY_IMAGE_NAME,
    KEY_PARENT_PIDS,
    KEY_WORKSPACE_MANAGER,
    WorkspaceManagerFactory,
    get_container_process,
    get_workspace_meta_from_manager,
)
from composio.local_tools.local_workspace.commons.utils import (
    communicate,
    communicate_with_handling,
    get_container_by_container_name,
)


LONG_TIMEOUT = 200
logger = get_logger()

REPO_NAME = os.environ.get("REPO_NAME", "princeton-nlp/SWE-bench")


class SetupGithubRepoRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )
    # repo_name: str = Field(..., description="github repo-name for which issue needs to be solved")


class SetupGithubRepoResponse(BaseModel):
    github_repo_copy_resp: str = Field(..., description="response of github repo copy")


class SetupGithubRepo(Action):
    """
    clones github repo in the workspace
    """

    _display_name = "Clone github repo on workspace"
    _request_schema = SetupGithubRepoRequest
    _response_schema = SetupGithubRepoResponse
    _tags = ["workspace"]
    _tool_name = "localworkspace"
    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def __init__(self):
        super().__init__()
        self.args = None
        self.workspace_id = ""
        self.repo_name = REPO_NAME
        self.image_name = ""
        self.container_name = ""
        self.container_process = None
        self.parent_pids = []
        self.container_obj = None
        self.logger = logger
        self.repo_type = "not_local"

    def _setup(self, args: SetupGithubRepoRequest):
        self.args = args
        self.workspace_id = args.workspace_id
        workspace_meta = get_workspace_meta_from_manager(
            self.workspace_factory, self.workspace_id
        )
        self.image_name = workspace_meta[KEY_IMAGE_NAME]
        self.container_name = workspace_meta[KEY_CONTAINER_NAME]
        self.container_process = get_container_process(
            workspace_meta[KEY_WORKSPACE_MANAGER]
        )
        self.parent_pids = workspace_meta[KEY_PARENT_PIDS]
        self.container_obj = self.get_container_by_container_name()
        if not self.container_obj:
            raise ValueError(
                f"container-name {self.container_name} is not a valid docker-container"
            )
        self._github_token = self.load_github_token_from_host_env()

    def set_workspace_and_history(
        self,
        workspace_factory: WorkspaceManagerFactory,
        history_processor: HistoryProcessor,
    ):
        self.workspace_factory = workspace_factory
        self.history_processor = history_processor

    def get_container_by_container_name(self):
        container_obj = get_container_by_container_name(
            self.container_name, self.image_name
        )
        return container_obj

    def load_github_token_from_host_env(self):
        # Retrieve the token from an environment variable
        access_token = os.getenv("GITHUB_ACCESS_TOKEN")

        # Check if the token is available
        if access_token is None:
            raise ValueError(
                "GitHub access token is not set in the environment variables"
            )
        return access_token

    def reset(self):
        # Clone repository if not already cloned
        folders = communicate(
            self.container_process, self.container_obj, "ls", self.parent_pids
        ).split("\n")
        if self.repo_name not in folders:
            raise ValueError(f"repo name {self.repo_name} is not found in workspace")

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

    def execute(
        self, request_data: SetupGithubRepoRequest, authorisation_data: dict = {}
    ):
        self._setup(request_data)
        token_prefix = ""
        if self._github_token:
            token_prefix = f"{self._github_token}@"
        communicate_with_handling(
            self.container_process,
            self.container_obj,
            f"git clone https://{token_prefix}github.com/{self.repo_name}.git",
            self.parent_pids,
            error_msg="Failed to clone repository from mirror",
            timeout_duration=LONG_TIMEOUT,
        )
        return SetupGithubRepoResponse(
            github_repo_copy_resp=f"repo: {self.repo_name} is cloned to container"
        )
