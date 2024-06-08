import datetime
import hashlib
import os
import subprocess
import time
import typing as t
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import docker
from pydantic import BaseModel

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.utils import (
    communicate,
    get_container,
    get_container_by_container_name,
    process_output,
    read_with_timeout,
)


logger = get_logger()

COMMANDS_CONFIG_PATH = "../config/commands.yaml"
TYPE_WORKSPACE_LOCAL_DOCKER = "local_docker"

KEY_WORKSPACE_MANAGER = "workspace"
KEY_CONTAINER_NAME = "container_name"
KEY_PARENT_PIDS = "parent_pids"
KEY_IMAGE_NAME = "image_name"
KEY_WORKSPACE_ID = "workspace_id"


class LocalDockerArgumentsModel(BaseModel):
    image_name: str
    timeout: int = 35
    verbose: bool = False
    environment_setup: Optional[str] = None


class LocalDockerWorkspace:
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
        self.container_name: str = ""
        self.container: t.Optional[subprocess.Popen] = None
        self.container_obj = None
        self.persistent = False
        self.container_pid = None
        self.parent_pids: t.Set[str] = set()
        if not self.args.verbose:
            self.logger.disabled = True

        # Establish connection with execution container
        self.image_name = args.image_name
        self._reset_container()

        # Set timeout
        self.timeout = self.args.timeout
        self.idx = 0
        self.clean_multi_line_functions = lambda x: x
        self.hooks: List[Any] = []

    def _reset_container(self) -> None:
        if hasattr(self, "container"):
            try:
                if self.container is None:
                    raise ValueError("Container is None")
                self.container.terminate()
            except KeyboardInterrupt:
                logger.error("handling keyboard interrupt")
                raise
            except Exception as e:
                logger.error("reset container exception: %s", e)
        self._init_container()
        self._init_scripts()

    def _init_container(self):
        """
        Handles container initialization. Defines container name and creates it
        """
        if not self.container_name:
            process_id = str(os.getpid())
            current_time = str(datetime.datetime.now())
            unique_string = current_time + process_id
            hash_object = hashlib.sha256(unique_string.encode())
            # Cannot have colons/slashes in container name, but those are important in image names
            # i.e., when we want swe-agent to pull the image from dockerhub
            image_name_sanitized = self.image_name.replace("/", "-")
            image_name_sanitized = image_name_sanitized.replace(":", "-")
            self.container_name = (
                f"{image_name_sanitized}-{hash_object.hexdigest()[:10]}"
            )
        self.container, self.parent_pids = get_container(
            self.container_name, self.image_name, persistent=self.persistent
        )
        self.container_pid = self.container.pid

        client = None

        try:
            client = docker.from_env()
            self.container_obj = client.containers.get(self.container_name)
        except docker.errors.DockerException as e:  # pylint: disable=bad-except-order
            if "Error while fetching server API version" in str(e):
                raise RuntimeError(
                    "Docker is not running. Please start Docker and try again."
                ) from e

        except docker.errors.NotFound as exc:  # pylint: disable=bad-except-order
            logger.debug("Couldn't find container. Let's wait and retry.")
            time.sleep(3)
            if client is not None:
                self.container_obj = client.containers.get(self.container_name)
            else:
                raise ValueError("Client is None") from exc

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
        if self.container is None:
            raise ValueError("Container is None")

        logs, self.returncode = communicate(
            self.container,
            self.container_obj,
            input,
            list(self.parent_pids),
            timeout_duration=timeout_duration,
        )
        if self.returncode != 0:
            self.logger.error("%s: %s", error_msg, logs)
            self.close()
            raise RuntimeError(f"{error_msg}: {logs}")
        return logs

    def communicate(self, input: str, timeout_duration=25) -> Tuple[str, int]:
        if self.container is None:
            raise ValueError("Container is None")
        output, return_code = communicate(
            self.container,
            self.container_obj,
            input,
            list(self.parent_pids),
            timeout_duration,
        )
        output, return_code = process_output(output, return_code)
        return output, return_code

    def interrupt(self):
        """
        Send interrupt signal to container and exhaust stdout buffer with a communicate call
        """
        pids = self.get_pids()
        if self.container_obj is None:
            raise ValueError("Container is None")
        for pid, cmd in pids:
            if pid not in self.parent_pids and cmd != "ps":
                self.container_obj.exec_run(f"kill -9 {pid}")
        try:
            _ = read_with_timeout(
                self.container, self.container_obj, self.get_pids, self.parent_pids, 20
            )
        except TimeoutError:
            pass
        try:
            output, _ = self.communicate(input="echo 'interrupted'", timeout_duration=5)
            assert output.strip().endswith(
                "interrupted"
            ), "container health check failed"
        except TimeoutError as exc:
            raise RuntimeError("Failed to interrupt container") from exc

    def get_pids(self, all_pids=False) -> list[str]:
        """
        Gets list of processes running inside docker container
        """
        if self.container_obj is None:
            raise ValueError("Container is None")

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
            if self.container is None:
                raise ValueError("Container is None")
            communicate(
                self.container,
                self.container_obj,
                "exit",
                parent_pids=list(self.parent_pids),
            )
        except KeyboardInterrupt:
            logger.error("handling keyboard interrupt")
            raise
        except Exception as e:
            logger.error("docker close exception: %s", e)
        assert self.container is not None
        assert self.container_obj is not None
        self.container.terminate()
        if self.persistent:
            if self.container_obj.status not in {"paused", "exited"}:
                self.container_obj.pause()
                self.logger.info("Agent container paused")
            else:
                self.logger.info(
                    "Agent container status: %s", self.container_obj.status
                )
        else:
            try:
                self.container_obj.remove(force=True)
            except KeyboardInterrupt:
                logger.error("handling keyboard interrupt")
                raise
            except Exception as e:
                logger.error("docker close exception: %s", e)
            self.logger.info("Agent container stopped")
        # todo: implement these hooks
        for hook in self.hooks:
            hook.on_close()


class WorkspaceManagerFactory:
    _registry: Dict[str, Dict[str, Any]] = {}

    def get_workspace_manager(self, args: LocalDockerArgumentsModel) -> str:
        # currently we only support local docker
        workspace_type = TYPE_WORKSPACE_LOCAL_DOCKER
        if workspace_type == TYPE_WORKSPACE_LOCAL_DOCKER:
            workspace_manager = LocalDockerWorkspace(args)
            container_name = workspace_manager.container_name
            parent_pids = workspace_manager.parent_pids
            workspace_id = str(uuid4())
            self._registry[workspace_id] = {
                KEY_WORKSPACE_MANAGER: workspace_manager,
                KEY_CONTAINER_NAME: container_name,
                KEY_PARENT_PIDS: parent_pids,
                KEY_IMAGE_NAME: args.image_name,
            }
            return workspace_id

        raise ValueError(f"Unknown workspace manager type: {workspace_type}")

    def get_workspace_state(self, workspace_id: str):
        """
        returns the current working directory in the workspace
        """
        state_cmd = "echo '{\"working_dir\": \"'${PWD}'\"}'"
        workspace_meta = self.get_registered_manager(workspace_id)
        if not workspace_meta:
            logger.error(
                "workspace-manager has no workspace by workspace-id: %s", workspace_id
            )
            return None
        image_name = workspace_meta[KEY_IMAGE_NAME]
        container_name = workspace_meta[KEY_CONTAINER_NAME]
        container_process = get_container_process(workspace_meta[KEY_WORKSPACE_MANAGER])
        container_obj = get_container_by_container_name(container_name, image_name)
        parent_pids = workspace_meta[KEY_PARENT_PIDS]
        output, _ = communicate(
            container_process, container_obj, state_cmd, parent_pids
        )
        return output

    def get_registered_manager(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        return self._registry.get(workspace_id)

    def remove_workspace_manager(self, workspace_id: str) -> None:
        if workspace_id in WorkspaceManagerFactory._registry:
            del self._registry[workspace_id]

    def list_workspace_managers(self) -> Dict[str, Any]:
        return self._registry


def get_workspace_meta_from_manager(
    workspace_factory: WorkspaceManagerFactory, workspace_id: str
) -> dict:
    workspace_meta = workspace_factory.get_registered_manager(workspace_id)
    if workspace_meta is None:
        raise ValueError(f"Workspace manager not found: {workspace_id}")
    return workspace_meta


def get_container_name_from_workspace_id(
    workspace_factory: WorkspaceManagerFactory, workspace_id: str
) -> str:
    workspace_meta = workspace_factory.get_registered_manager(workspace_id)
    if workspace_meta is None:
        raise ValueError(f"Workspace manager not found: {workspace_id}")
    return workspace_meta[KEY_CONTAINER_NAME]


def get_container_process(workspace: LocalDockerWorkspace):
    if not workspace or not workspace.container:
        raise ValueError("workspace null, or not running any container process")
    return workspace.container
