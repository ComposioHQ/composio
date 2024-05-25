import datetime
import docker
import gymnasium as gym
import hashlib
import logging
import os
import time

from dataclasses import dataclass
from rich.logging import RichHandler
from simple_parsing.helpers.serialization.serializable import FrozenSerializable

from pydantic.v1 import BaseModel

from typing import Optional, Tuple

from utils import get_container, read_with_timeout, communicate
# from tools.services.swelib.local_workspace.observation_assembler import ObservationAssemblerArgumentsModel, ObservationAssembler
from tools.services.swelib.local_workspace.docker_cmd_manager import DockerCommandManagerArgsModel, DockerCommandManager
from tools.services.swelib.local_workspace.docker_setup_env import DockerSetupEnvRequest, DockerSetupManager
from tools.services.swelib.local_workspace.workspace_status import DockerContainerStatusRequest, DockerContainerStatus
from tools.services.swelib.local_workspace.swe_special_command_handler import ShellEditor, EditorOperationRequest
from tools.services.swelib.local_workspace.copy_github_repo import CopyGithubRepoRequest, CopyGithubRepo, execute_copy_github_repo


LOGGER_NAME = "composio_logger"

LONG_TIMEOUT = 500
PATH_TO_REQS = "/root/requirements.txt"
PATH_TO_ENV_YML = "/root/environment.yml"

handler = RichHandler(show_time=False, show_path=False)
handler.setLevel(logging.DEBUG)
logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.propagate = False

COMMANDS_CONFIG_PATH = "../config/commands.yaml"


@dataclass(frozen=True)
class LocalDockerArguments(FrozenSerializable):
    """Configure data sources and setup instructions for the environment in which we solve the tasks.
    """
    # Source of issue statement/problem statement. To run over a batch of issues: Path to a data file
    # (`json`, `jsonl`) or directory. To run over single issue: github issue url or path to markdown file
    # with problem statement or problem statement as text prefixed with `text://`.
    image_name: str
    container_name: Optional[str] = None
    install_environment: bool = True
    timeout: int = 35
    verbose: bool = False
    no_mirror: bool = False
    # Custom environment setup. Currently only used when data_path points to a single issue.
    # This needs to be either a string pointing to a yaml file (with yaml, yml file extension)
    # or a shell script (with sh extension).
    # See https://github.com/princeton-nlp/SWE-agent/pull/153 for more information
    environment_setup: Optional[str] = None


class LocalDockerArgumentsModel(BaseModel):
    image_name: str
    timeout: int = 35
    verbose: bool = False
    # Custom environment setup. Currently only used when data_path points to a single issue.
    # This needs to be either a string pointing to a yaml file (with yaml, yml file extension)
    # or a shell script (with sh extension).
    # See https://github.com/princeton-nlp/SWE-agent/pull/153 for more information
    environment_setup: Optional[str] = None



class LocalDockerWorkspace(gym.Env):
    """Gym environment for SWE-bench. This class should handle all communication with the docker container."""

    name = "swe_main"

    def __init__(self, args: LocalDockerArgumentsModel):
        super().__init__()
        self.args = args
        self.base_commit = None
        self.communicate_output = None
        # self.install_environment = args.install_environment
        self.logger = logger
        # self.persistent = args.container_name is not None
        self.returncode = None
        self.container_name = None
        self.persistent = None
        self.container_pid = None
        if not self.args.verbose:
            self.logger.disabled = True

        # Establish connection with execution container
        self.image_name = args.image_name
        self._reset_container()

        # Set timeout
        self.timeout = self.args.timeout
        self.idx = 0
        self.clean_multi_line_functions = lambda x: x
        self.hooks = []

    def _reset_container(self) -> None:
        if hasattr(self, "container"):
            try:
                self.container.terminate()
            except KeyboardInterrupt:
                raise
            except:
                pass
        self._init_container()
        self._init_scripts()

    def _init_container(self) -> None:
        """
        Handles container initialization. Defines container name and creates it
        """
        if self.container_name is None:
            process_id = str(os.getpid())
            current_time = str(datetime.datetime.now())
            unique_string = current_time + process_id
            hash_object = hashlib.sha256(unique_string.encode())
            # Cannot have colons/slashes in container name, but those are important in image names
            # i.e., when we want swe-agent to pull the image from dockerhub
            image_name_sanitized = self.image_name.replace("/", "-")
            image_name_sanitized = image_name_sanitized.replace(":", "-")
            self.container_name = f"{image_name_sanitized}-{hash_object.hexdigest()[:10]}"
        self.container, self.parent_pids = get_container(
            self.container_name, self.image_name, persistent=self.persistent
        )
        self.container_pid = self.container.pid
        try:
            client = docker.from_env()
        except docker.errors.DockerException as e:
            if "Error while fetching server API version" in str(e):
                raise RuntimeError(
                    "Docker is not running. Please start Docker and try again."
                ) from e
        try:
            self.container_obj = client.containers.get(self.container_name)
        except docker.errors.NotFound:
            logger.debug("Couldn't find container. Let's wait and retry.")
            time.sleep(3)
            self.container_obj = client.containers.get(self.container_name)
        self.logger.info("🌱 Environment Initialized")

    def _init_scripts(self):
        """
        Initialize custom commands within container
        """
        self.communicate_with_handling(
            "source /root/.bashrc",
            error_msg="Failed to source .bashrc",
        )
        self.communicate_with_handling(
            "mkdir -p /root/commands",
            error_msg="Failed to create commands directory",
        )
        self.communicate_with_handling(
            "touch /root/commands/__init__.py",
            error_msg="Failed to create __init__.py",
        )
        self.communicate_with_handling(
            "export PATH=$PATH:/root/commands",
            error_msg="Failed to add commands directory to PATH",
        )

    def reset_container(self):
      pass

    def communicate_with_handling(
        self, input: str, error_msg: str, timeout_duration=25
    ) -> str:
        """
        Wrapper for communicate function that raises error if return code is non-zero
        """
        logs, self.returncode= communicate(self.container, self.container_obj, input, self.parent_pids, timeout_duration=timeout_duration)
        if self.returncode != 0:
            self.logger.error(f"{error_msg}: {logs}")
            self.close()
            raise RuntimeError(f"{error_msg}: {logs}")
        return logs

    def communicate(
        self,
        input: str,
        timeout_duration=25,
    ) -> str:
        """
        Sends input to container and returns output

        Args:
            input (`str`) - input to send to container

        Returns:
            output (`str`) - output from container
        """
        output, self.returncode = communicate(self.container, input, self.parent_pids, timeout_duration)
        self.communicate_output = output

    def interrupt(self):
        """
        Send interrupt signal to container and exhaust stdout buffer with a communicate call
        """
        pids = self.get_pids()
        for pid, cmd in pids:
            if pid not in self.parent_pids and cmd != "ps":
                self.container_obj.exec_run(f"kill -9 {pid}")
        try:
            _ = read_with_timeout(self.container, self.get_pids, 20)
        except TimeoutError:
            pass
        try:
            output = self.communicate(input="echo 'interrupted'", timeout_duration=5)
            assert output.strip().endswith("interrupted"), "container health check failed"
        except TimeoutError:
            raise RuntimeError("Failed to interrupt container")

    def get_pids(self, all_pids=False) -> list[str]:
        """
        Gets list of processes running inside docker container
        """
        pids = (
            self.container_obj.exec_run("ps -eo pid,comm --no-headers")
            .output.decode()
            .split("\n")
        )
        pids = [x.split() for x in pids if x]
        if not all_pids:
            pids = [x for x in pids if x[1] != "ps" and x[0] not in self.parent_pids]
        return pids
    
    def close(self):
        """
        Handle environment shutdown
        """
        self.logger.info("Beginning environment shutdown...")
        try:
            communicate(self.container, input="exit", parent_pids=self.parent_pids)
        except KeyboardInterrupt:
            raise
        except:
            pass
        assert self.container is not None
        assert self.container_obj is not None
        self.container.terminate()
        if self.persistent:
            if self.container_obj.status not in {"paused", "exited"}:
                self.container_obj.pause()
                self.logger.info("Agent container paused")
            else:
                self.logger.info(f"Agent container status: {self.container_obj.status}")
        else:
            try:
                self.container_obj.remove(force=True)
            except KeyboardInterrupt:
                raise
            except:
                pass
            self.logger.info("Agent container stopped")
        # todo: implement these hooks
        for hook in self.hooks:
            hook.on_close()


def execute_local_docker_workspace(args: LocalDockerArgumentsModel):
    w = LocalDockerWorkspace(args)
    resp = {"container_name": w.container_name,
            "parent_pids": w.parent_pids,
            "container_process": w.container}
    print(resp)
    return resp


if __name__ == "__main__":
    # todo: handle install_env function --> in original code its installing envs
    args = LocalDockerArguments(
        image_name="sweagent/swe-agent:latest",
        verbose=True,
        install_environment=False,
    )
    w = LocalDockerWorkspace(args)
    c = w.container


def check_simple_implementation():
    args = LocalDockerArgumentsModel(
        image_name="sweagent/swe-agent:latest",
        verbose=True,
        install_environment=True,
    )
    image_name = args.image_name
    env = LocalDockerWorkspace(args)
    print(env.container_name, env.image_name)
    container_process = env.container
    container_name = env.container_name
    container_pid = container_process.pid
    parent_pids = env.parent_pids

    # setup environment + copy commands + source scripts
    setup_docker_args = DockerSetupEnvRequest(container_name=container_name,
                                              workspace_id="123",
                                              image_name=image_name)
    setup_manager = DockerSetupManager(setup_docker_args)
    setup_manager.set_container_process(container_process, parent_pids)
    setup_manager.set_env_variables()

    # copy github repo
    copy_repo_args = CopyGithubRepoRequest(
        container_name=env.container_name,
        workspace_id="123",
        repo_name="princeton-nlp/SWE-bench",
        image_name=image_name)
    resp = execute_copy_github_repo(copy_repo_args, container_process, parent_pids)

    # load all the special commands
    special_commands_util = ShellEditor(COMMANDS_CONFIG_PATH)
    all_special_cmds = special_commands_util.get_all_commands()

    # run special command
    special_cmd_args: EditorOperationRequest = EditorOperationRequest(command="find_file",
                                                          workspace_id="123",
                                                          arguments=["README.md", "/SWE-bench/"])
    output = special_commands_util.perform_operation(special_cmd_args, container_process, container_name,
                                            image_name, parent_pids)
    print(output)


if __name__ == "__main__":
    check_simple_implementation()

