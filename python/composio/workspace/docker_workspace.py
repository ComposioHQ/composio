import datetime
import hashlib
import os
import subprocess
import tarfile
import tempfile
import traceback
from io import BytesIO
from typing import Optional, Set

import docker
from pydantic import BaseModel

from composio.workspace.get_logger import get_logger

from .base_workspace import BaseCmdResponse, Workspace, WorkspaceEnv


logger = get_logger("local_docker_workspace")
STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"
STATUS_NOT_FOUND = "not_found"
STATUS_ERROR = "error"


def process_output(output: str, return_code: Optional[int]):
    if return_code is None:
        return_code = 1
        output = "Exception: " + output
    return output, return_code


class LocalDockerArgumentsModel(BaseModel):
    image_name: str
    timeout: int = 35
    verbose: bool = False
    environment_setup: Optional[str] = None
    persistent: bool = False


class DockerWorkspace(Workspace):
    def __init__(self, image_name, docker_client, is_persistent=False):
        super().__init__()
        self.docker_client = docker_client
        self.image_name = image_name
        self.container_name: str = ""
        self.container_process: Optional[subprocess.Popen] = None
        self.container_obj = None
        self.persistent = is_persistent
        self.container_pid = None
        self.parent_pids: Set[str] = set()

        self.reset()

    def setup(self, env: WorkspaceEnv, **kwargs):
        """
        Sets up the environment for the workspace using the provided WorkspaceEnv instance.
        """
        commands = "\n".join(env.commands_to_execute)
        output, return_code = None, 0
        try:
            setup_resp = self.communicate(commands)
            output, return_code = setup_resp.output, setup_resp.return_code
        except KeyboardInterrupt as exc:
            if return_code != 0:
                raise RuntimeError(
                    f"Nonzero return code: {return_code}\nOutput: {output}"
                ) from exc
            raise
        except Exception as e:
            logger.warning("Failed to set environment variables")
            raise e
        for cmd_file in env.copy_file_to_workspace:
            name = cmd_file.name
            contents = cmd_file.datum
            self.copy_file_to_container(contents, f"/root/commands/{name}")
            if cmd_file.cmd_type == "source_file":
                self.communicate_with_handling(
                    f"source /root/commands/{name}",
                    error_msg=(
                        f"Failed to source {name}. If you meant to make a script "
                        f"start the file with a shebang (e.g. #!/usr/bin/env python)."
                    ),
                )
            elif cmd_file.cmd_type == "script":
                self.communicate_with_handling(
                    f"chmod +x /root/commands/{name}",
                    error_msg=f"Failed to chmod {name}",
                )
            elif cmd_file.cmd_type == "utility":
                # nothing to do for utility scripts
                pass
            else:
                raise ValueError(f"Invalid command type: {cmd_file.cmd_type}")

    def reset(self):
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

    def get_running_status(self):
        try:
            container = self.docker_client.containers.get(self.container_name)
            if container.status == STATUS_RUNNING:
                return STATUS_RUNNING
            return STATUS_STOPPED
        except docker.errors.NotFound:
            return STATUS_NOT_FOUND
        except docker.errors.APIError as e:
            logger.error("Error checking container status: %s", e)
            return STATUS_STOPPED

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
        self.container_process, self.parent_pids = self.docker_client.get_container(
            self.container_name, self.image_name
        )
        self.container_obj = self.docker_client.get_container_by_container_name(
            self.container_name, self.image_name
        )

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

    def communicate_with_handling(self, cmd, error_msg, timeout_duration=25):
        self.docker_client.communicate_with_handling(
            self.container_process,
            self.container_obj,
            cmd,
            self.parent_pids,
            error_msg,
            timeout_duration,
        )

    def communicate(self, cmd: str, timeout: int = 25) -> BaseCmdResponse:
        if self.container_process is None:
            raise ValueError("Container is None")
        output, return_code = self.docker_client.communicate(
            self.container_process,
            self.container_obj,
            cmd,
            list(self.parent_pids),
            timeout,
        )
        output, return_code = process_output(output, return_code)
        return BaseCmdResponse(output=output, return_code=return_code)

    def copy_file_to_container(self, contents, container_path):
        """
        Copies a given string into a Docker container at a specified path.
        """
        temp_file_name = None

        try:
            # Create a temporary file
            with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                temp_file_name = temp_file.name
                # Write the string to the temporary file and ensure it's written to disk
                temp_file.write(contents.encode("utf-8"))
                temp_file.flush()
                os.fsync(temp_file.fileno())

            # Create a TAR archive in memory containing the temporary file
            with tempfile.NamedTemporaryFile():
                with open(temp_file_name, "rb") as temp_file:
                    # Prepare the TAR archive
                    with BytesIO() as tar_stream:
                        with tarfile.open(fileobj=tar_stream, mode="w") as tar:
                            tar_info = tarfile.TarInfo(
                                name=os.path.basename(container_path)
                            )
                            tar_info.size = os.path.getsize(temp_file_name)
                            tar.addfile(tarinfo=tar_info, fileobj=temp_file)
                        tar_stream.seek(0)
                        # Copy the TAR stream to the container
                        self.container_obj.put_archive(
                            path=os.path.dirname(container_path), data=tar_stream.read()
                        )

        except Exception as e:
            logger.error("An error occurred: %s", e)
            logger.error(traceback.format_exc())
        finally:
            # Cleanup: Remove the temporary file if it was created
            if temp_file_name and os.path.exists(temp_file_name):
                os.remove(temp_file_name)

    def get_state(self) -> dict:
        return {}

    def close(self):
        """
        Handle environment shutdown
        """
        logger.info("Beginning environment shutdown...")
        try:
            if self.container_process is None:
                raise ValueError("Container is None")
            self.communicate("exit")
        except KeyboardInterrupt:
            logger.error("handling keyboard interrupt")
            raise
        except Exception as e:
            logger.error("docker close exception: %s", e)
        assert self.container_process is not None
        assert self.container_obj is not None
        self.container_process.terminate()
        if self.persistent:
            if self.container_obj.status not in {"paused", "exited"}:
                self.container_obj.pause()
                logger.info("Agent container paused")
            else:
                logger.info("Agent container status: %s", self.container_obj.status)
        else:
            try:
                self.container_obj.remove(force=True)
            except KeyboardInterrupt:
                logger.error("handling keyboard interrupt")
                raise
            except Exception as e:
                logger.error("docker close exception: %s", e)
            logger.info("Agent container stopped")
