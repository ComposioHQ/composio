import logging
import os
import subprocess
from pathlib import Path
from rich.logging import RichHandler

from pydantic.v1 import BaseModel, Field

from utils import communicate_with_handling, get_container_by_container_name, communicate

LOGGER_NAME = "composio_logger"

handler = RichHandler(show_time=False, show_path=False)
handler.setLevel(logging.DEBUG)
logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.propagate = False
LONG_TIMEOUT = 200


class CopyGithubRepoRequest(BaseModel):
    container_name: str = Field(..., description="locally running docker-container name")
    workspace_id: str = Field(..., description="workspace-id to get the running workspace-manager")
    image_name: str
    repo_name: str = Field(..., description="github repo-name for which issue needs to be solved")


class CopyGithubRepo:
    def __init__(self, args: CopyGithubRepoRequest):
        self.args = args
        self.image_name = args.image_name
        self.container_name = args.container_name
        self.container_obj = self.get_container_by_container_name()
        self.repo_name = args.repo_name
        self.logger = logger
        self.container_process = None
        self.parent_pids = None
        self.config = None
        self.config_file_path = Path("config/default.yaml")
        self._github_token = self.load_github_token_from_host_env()
        # self.repo_type = local --> will copy from your local
        # path to docker container path
        self.repo_type = "not_local"
        if not self.container_obj:
            raise Exception(f"container-name {self.container_name} is not a valid docker-container")

    def set_container_process(self, container_process, parent_pids):
        self.container_process = container_process
        self.parent_pids = parent_pids
        return

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
            self.copy_repo()

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

    def copy_repo(self) -> str:
        """Clone/copy repository/codebase in container
        Returns:
            folder name of clone
        """
        # repo_url = self.repo_name.replace('https://', f'https://{self._github_token}@')
        if self.repo_type == "local":
            self.copy_anything_to_container(self.container_obj, self.record["repo"].removeprefix("local://"), "/"+self._repo_name)
            communicate_with_handling(self.container_process, self.container_obj,
                f"chown -R root:root {self.repo_name}",
                 self.parent_pids,
                error_msg="Failed to change permissions on copied repository",
            )
            return self._repo_name
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

    def copy_anything_to_container(self, **kwargs):
        pass


def execute_copy_github_repo(args: CopyGithubRepoRequest, container_process: subprocess.Popen, parent_pids):
    c = CopyGithubRepo(args)
    c.set_container_process(container_process, parent_pids)
    c.copy_repo()
    c.reset()
    return {"resp": f"repo: {c.repo_name} is cloned to container"}