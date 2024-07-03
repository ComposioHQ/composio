"""
Docker workspace client.
"""

import datetime
import hashlib
import json
import os
import select
import subprocess
import tarfile
import tempfile
import time
import traceback
import typing as t
from io import BytesIO
from pathlib import Path

import docker
from docker.errors import DockerException, NotFound
from pydantic import BaseModel

from composio.tools.env.base import Command, CommandFile, Workspace, WorkspaceEnv
from composio.tools.env.utils import BaseCmdResponse
from composio.tools.local.base.action import Action
from composio.utils import get_enum_key
from composio.utils.logging import WithLogger


script_dir = ""

START_UP_DELAY = 5
TIMEOUT_DURATION = 25
EXIT_CMD = "exit"
STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"
STATUS_NOT_FOUND = "not_found"
STATUS_ERROR = "error"

DOCKER_ENV_VARS = {
    "WINDOW": 100,
    "OVERLAP": 2,
    "CURRENT_LINE": 0,
    "CURRENT_FILE": "",
    "SEARCH_RESULTS": (),
    "SEARCH_FILES": (),
    "SEARCH_INDEX": 0,
}

DOCKER_STATE_CMD = ""

docker_state_command = Command(
    name="state",
    code="""state() {
    echo '{"working_dir": "'$(realpath --relative-to=$ROOT/.. $PWD)'"}';
};""",
)

commands_to_execute = (
    [docker_state_command.code]
    + ["pip install flake8"]
    + [f"{k}={v}" for k, v in DOCKER_ENV_VARS.items()]
)


def get_background_pids(container_obj):
    pids = (
        container_obj.exec_run("ps -eo pid,comm --no-headers")
        .output.decode()
        .split("\n")
    )
    pids = [x.split() for x in pids if x]
    pids = [x for x in pids if x[1] not in {"ps"} and x[0] != "1"]
    bash_pids = [x for x in pids if x[1] == "bash"]
    other_pids = [x for x in pids if x[1] not in {"bash"}]
    return bash_pids, other_pids


def get_pids(container_obj, parent_pids, all_pids=False) -> list[str]:
    """
    Gets list of processes running inside docker container
    """
    pids = (
        container_obj.exec_run("ps -eo pid,comm --no-headers")
        .output.decode()
        .split("\n")
    )
    pids = [x.split() for x in pids if x]
    if not all_pids:
        pids = [x for x in pids if x[1] != "ps" and x[0] not in parent_pids]
    return pids


def get_default_docker_env():
    command_files = [
        "config/commands/defaults.sh",
        "config/commands/search.sh",
        "config/commands/edit_linting.sh",
        "config/commands/_split_string.py",
    ]
    command_files_formatted = []
    for each in command_files:
        full_file_path = (
            script_dir / Path("../local_tools/local_workspace") / Path(each)
        )
        datum = {}
        contents = ""
        with open(full_file_path, "r", encoding="utf-8") as f:
            contents = f.read()
        datum["contents"] = contents
        filename = Path(each).name
        if not contents.strip().startswith("#!"):
            if filename.endswith(".sh"):
                # files are sourced, so they are not executable
                datum["name"] = Path(each).name
                datum["type"] = "source_file"
            elif filename.startswith("_"):
                # files are sourced, so they are not executable
                datum["name"] = Path(each).name
                datum["type"] = "utility"
            else:
                raise ValueError(
                    (
                        f"Non-shell script file {each} does not start with shebang.\n"
                        "Either add a shebang (#!) or change the file extension to .sh if you want to source it.\n"
                        "You can override this behavior by adding an underscore to the file name (e.g. _utils.py)."
                    )
                )
        else:
            # scripts are made executable
            datum["name"] = Path(each).name.rsplit(".", 1)[0]
            datum["type"] = "script"
        command_files_formatted.append(
            CommandFile(
                datum=datum["contents"], cmd_type=datum["type"], name=datum["name"]
            )
        )
    docker_workspace_env = WorkspaceEnv(
        copy_file_to_workspace=command_files_formatted,
        commands_to_execute=commands_to_execute,
        setup_cmd=docker_state_command.code,
    )
    return docker_workspace_env


def process_output(output: str, return_code: t.Optional[int]):
    if return_code is None:
        return_code = 1
        output = "Exception: " + output
    return output, return_code


def read_with_timeout(
    container, container_obj, pid_func, parent_pids, timeout_duration
):
    """
    Read data from a subprocess with a timeout.
    This function uses a file descriptor to read data from the subprocess in a non-blocking way.

    Args:
        container (subprocess.Popen): The subprocess container.
        container_obj: container object returned from docker_client
        parent_pids: pids running on docker-container
        pid_func (function): A function that returns a list of process IDs (except the PID of the main process).
        timeout_duration (int): The timeout duration in seconds.

    Returns:
        str: The data read from the subprocess, stripped of trailing newline characters.

    Raises:
        TimeoutError: If the timeout duration is reached while reading from the subprocess.
    """
    buffer = b""
    fd = container.stdout.fileno()
    end_time = time.time() + timeout_duration

    while time.time() < end_time:
        pids = pid_func(container_obj, parent_pids)
        if len(pids) > 0:
            # There are still PIDs running
            time.sleep(0.05)
            continue
        ready_to_read, _, _ = select.select([fd], [], [], 0.1)
        if ready_to_read:
            data = os.read(fd, 4096)
            if data:
                buffer += data
        else:
            # No more data to read
            break
        time.sleep(0.05)  # Prevents CPU hogging

    if container.poll() is not None:
        raise RuntimeError(
            f"Subprocess exited unexpectedly.\nCurrent buffer: {buffer.decode()}"
        )
    if time.time() >= end_time:
        raise TimeoutError(
            f"Timeout reached while reading from subprocess.\nCurrent buffer: {buffer.decode()}\nRunning PIDs: {pids}"
        )
    return buffer.decode()


class LocalDockerArgumentsModel(BaseModel):
    image_name: str
    timeout: int = 35
    verbose: bool = False
    environment_setup: t.Optional[str] = None
    persistent: bool = False


class DockerIoClient(WithLogger):
    docker_client: t.Optional[docker.DockerClient] = None

    def client(self) -> docker.DockerClient:
        if self.docker_client is not None:
            return self.docker_client
        try:
            self.docker_client = docker.from_env()
        except DockerException as e:
            self.handle_docker_exception(e)
            raise
        return self.docker_client

    def handle_docker_exception(self, e):
        docker_not_running = any(
            (
                "connection aborted" in str(e).lower(),
                "connection refused" in str(e).lower(),
                "error while fetching server api version" in str(e).lower(),
            )
        )
        if docker_not_running:
            msg = (
                "Probably the Docker daemon is not running. Please start the Docker daemon and try again. "
                "You might need to allow the use of the docker socket "
            )
            raise RuntimeError(msg) from e

    def get_container(
        self, ctr_name: str, image_name: str, persistent: bool = False
    ) -> t.Tuple[subprocess.Popen, t.Set]:
        filtered_images = self.client().images.list(filters={"reference": image_name})

        if not filtered_images:
            msg = (
                f"Image {image_name} not found. Please ensure it is built and available. "
                "Please double-check that you followed all installation/setup instructions from the "
                "readme."
            )
            raise RuntimeError(msg)
        if len(filtered_images) > 1:
            self.logger.warning(
                "Multiple images found for %s, that's weird.", image_name
            )

        # attrs = filtered_images[0].attrs
        # if attrs:
        #     self.logger.info(
        #         "Found image %s with tags: %s, created: %s for os: %s arch: %s.",
        #         image_name,
        #         attrs["RepoTags"],
        #         attrs["Created"],
        #         attrs["Os"],
        #         attrs["Architecture"],
        #     )

        if persistent:
            return self._get_persistent_container(ctr_name, image_name)
        return self._get_non_persistent_container(ctr_name, image_name)

    def get_container_by_container_name(self, container_name: str, image_name: str):
        filtered_images = self.client().images.list(filters={"reference": image_name})
        if len(filtered_images) == 0:
            msg = (
                f"Image {image_name} not found. Please ensure it is built and available. "
                "Please double-check that you followed all installation/setup instructions from the "
                "readme."
            )
            raise RuntimeError(msg)
        if len(filtered_images) > 1:
            self.logger.warning(
                "Multiple images found for %s, that's weird.", image_name
            )
        # attrs = filtered_images[0].attrs
        # if attrs is not None:
        #     self.logger.info(
        #         "Found image %s with tags: %s, created: %s for os: %s arch: %s.",
        #         image_name,
        #         attrs["RepoTags"],
        #         attrs["Created"],
        #         attrs["Os"],
        #         attrs["Architecture"],
        #     )
        max_attempts = 5
        attempt = 0
        backoff_time = 1  # Initial backoff time in seconds
        while attempt < max_attempts:
            try:
                container_obj = self.client().containers.get(container_name)
                return container_obj
            except NotFound:
                self.logger.debug("Couldn't find container. Let's wait and retry.")
                time.sleep(backoff_time)
                backoff_time *= 2
                attempt += 1
        raise RuntimeError(
            f"Failed to find container {container_name} after {max_attempts} attempts."
        )

    def _get_persistent_container(
        self, ctr_name: str, image_name: str
    ) -> t.Tuple[subprocess.Popen, t.Set]:
        containers = self.client().containers.list(all=True, filters={"name": ctr_name})
        if ctr_name in [c.name for c in containers]:
            container_obj = self.client().containers.get(ctr_name)
            if container_obj.status in {"created"}:
                container_obj.start()
            elif container_obj.status in {"running"}:
                pass
            elif container_obj.status in {"exited"}:
                container_obj.restart()
            elif container_obj.status in {"paused"}:
                container_obj.unpause()
            else:
                raise RuntimeError(
                    f"Unexpected container status: {container_obj.status}"
                )
        else:
            container_obj = self.client().containers.run(
                image_name,
                command="/bin/bash -l -m",
                name=ctr_name,
                stdin_open=True,
                tty=True,
                detach=True,
                auto_remove=False,
            )
            container_obj.start()
        startup_cmd = [
            "docker",
            "exec",
            "-i",
            ctr_name,
            "/bin/bash",
            "-l",
            "-m",
        ]
        # self.logger.debug("Starting container with command: %s", shlex.join(startup_cmd))
        # pylint: disable=R1732
        container = subprocess.Popen(
            startup_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,  # line buffered
        )
        time.sleep(START_UP_DELAY)
        # try to read output from container setup (usually an error), timeout if no output
        output = read_with_timeout(
            container, None, lambda arge1, arg2: [], [], timeout_duration=2
        )
        if output:
            self.logger.error("Unexpected container setup output: %s", output)
        # Get the process IDs of the container
        # There should be at least a head process and possibly one child bash process
        bash_pids, other_pids = get_background_pids(container_obj)
        bash_pid = 1
        if len(bash_pids) == 1:
            bash_pid = bash_pids[0][0]
        elif len(bash_pids) > 1 or len(other_pids) > 0:
            raise RuntimeError(
                f"Detected alien processes attached or running. "
                f"Please ensure that no other agents are running on this container. PIDs: {bash_pids}, {other_pids}"
            )
        return container, set(
            map(
                str,
                [
                    bash_pid,
                    1,
                ],
            )
        )

    def _get_non_persistent_container(
        self, ctr_name: str, image_name: str
    ) -> t.Tuple[subprocess.Popen, t.Set]:
        startup_cmd = [
            "docker",
            "run",
            "-i",
            "--rm",
            "--name",
            ctr_name,
            image_name,
            "/bin/bash",
            "-l",
            "-m",
        ]
        # self.logger.debug("Starting container with command: %s", shlex.join(startup_cmd))
        container = subprocess.Popen(  # pylint: disable=consider-using-with
            startup_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,  # line buffered
        )
        time.sleep(START_UP_DELAY)
        # try to read output from container setup (usually an error), timeout if no output
        output = read_with_timeout(
            container, None, lambda arg1, arg2: [], [], timeout_duration=2
        )
        if output:
            self.logger.error("Unexpected container setup output: %s", output)
        return container, {
            "1",
        }  # bash PID is always 1 for non-persistent containers

    def _check_syntax(self, container, container_obj, cmd_input: str, parent_pids):
        """
        Saves environment variables to file
        """
        output, return_code = self._communicate(
            container,
            container_obj,
            f"/bin/bash -n <<'EOF'\n{cmd_input}\nEOF\n",
            parent_pids,
        )
        return output, return_code == 0

    def _communicate(
        self, container, container_obj, cmd_input: str, parent_pids, timeout_duration=25
    ):
        try:
            cmd = cmd_input if cmd_input.endswith("\n") else cmd_input + "\n"
            os.write(container.stdin.fileno(), cmd.encode())
            time.sleep(0.1)
            container.stdin.flush()
        except BrokenPipeError as exc:
            traceback.print_exc()
            self.logger.error(
                "Failed to communicate with container. Check docker logs for more information."
            )
            raise RuntimeError("Failed to communicate with container") from exc
        try:
            buffer = read_with_timeout(
                container, container_obj, get_pids, parent_pids, timeout_duration
            )
            container.stdin.write("echo $?\n")
            time.sleep(0.1)
            container.stdin.flush()
            exit_code = read_with_timeout(
                container, container_obj, get_pids, parent_pids, 5
            ).strip()
        except Exception as e:
            self.logger.error("Read with timeout failed on input:\n---\n%s\n---", input)
            raise e
        if not exit_code.isdigit():
            raise RuntimeError(
                f"Container crashed. Failed to get exit code. Output:\n---\n{buffer}\n---"
            )
        return_code = int(exit_code)
        return buffer, return_code

    def communicate(
        self,
        container: subprocess.Popen,
        container_obj,
        input_cmd: str,
        parent_pids: t.List[str],
        timeout_duration=25,
    ):
        return_code = None
        if input_cmd.strip() != EXIT_CMD:
            output, valid = self._check_syntax(
                container, container_obj, input_cmd, parent_pids
            )
            if not valid:
                return output, return_code
            output, return_code = self._communicate(
                container,
                container_obj,
                input_cmd,
                parent_pids,
                timeout_duration=timeout_duration,
            )
            return output, return_code
        # if input_cmd = "exit" --> terminate container and exit
        self.terminate_container(container)
        return_code = 0
        return "", return_code

    def terminate_container(self, container):
        pass

    def communicate_with_handling(
        self,
        container_process: subprocess.Popen,
        container_obj,
        cmd_input: str,
        parent_pids: t.List[str],
        error_msg: str,
        timeout_duration=25,
    ) -> str:
        """
        Wrapper for communicate function that raises error if return code is non-zero
        """
        logs, return_code = self.communicate(
            container_process,
            container_obj,
            cmd_input,
            parent_pids,
            timeout_duration=timeout_duration,
        )
        if return_code != 0:
            self.logger.error("%s: %s", error_msg, logs)
            # call close container here in future
            # self.close()
            raise RuntimeError(f"{error_msg}: {logs}")
        return logs

    def get_pids(self, container_obj, parent_pids, all_pids=False) -> list[str]:
        """
        Gets list of processes running inside docker container
        """
        pids = (
            container_obj.exec_run("ps -eo pid,comm --no-headers")
            .output.decode()
            .split("\n")
        )
        pids = [x.split() for x in pids if x]
        if not all_pids:
            pids = [x for x in pids if x[1] != "ps" and x[0] not in parent_pids]
        return pids


class DockerWorkspace(Workspace, WithLogger):
    def __init__(self, image_name, docker_client, is_persistent=False):
        Workspace.__init__(self)
        WithLogger.__init__(self)
        self.docker_client = docker_client
        self.image_name = image_name
        self.container_name: str = ""
        self.container_process: t.Optional[subprocess.subprocess.Popen] = None
        self.container_obj = None
        self.persistent = is_persistent
        self.container_pid = None
        self.parent_pids: t.Set[str] = set()

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
            self.logger.warning("Failed to set environment variables")
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
                self.logger.error("handling keyboard interrupt")
                raise
            except Exception as e:
                self.logger.error("reset container exception: %s", e)
        self._init_container()
        self._init_scripts()

    def get_running_status(self):
        try:
            container = self.get_client().containers.get(self.container_name)
            if container.status == STATUS_RUNNING:
                return STATUS_RUNNING
            return STATUS_STOPPED
        except docker.errors.NotFound:
            return STATUS_NOT_FOUND
        except docker.errors.APIError as e:
            self.logger.error("Error checking container status: %s", e)
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
        self.container_process, self.parent_pids = self.get_client().get_container(
            self.container_name, self.image_name
        )
        self.container_obj = self.get_client().get_container_by_container_name(
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
        self.get_client().communicate_with_handling(
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
        output, return_code = self.get_client().communicate(
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
            self.logger.error("An error occurred: %s", e)
            self.logger.error(traceback.format_exc())
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
        self.logger.info("Beginning environment shutdown...")
        try:
            if self.container_process is None:
                raise ValueError("Container is None")
            self.communicate("exit")
        except KeyboardInterrupt:
            self.logger.error("handling keyboard interrupt")
            raise
        except Exception as e:
            self.logger.error("docker close exception: %s", e)
        assert self.container_process is not None
        assert self.container_obj is not None
        self.container_process.terminate()
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
                self.logger.error("handling keyboard interrupt")
                raise
            except Exception as e:
                self.logger.error("docker close exception: %s", e)
            self.logger.info("Agent container stopped")

    def execute_action(self, action_obj: Action, request_data: dict, metadata: dict):
        communicate_resp = self.record_history_and_communicate(
            f"composio actions execute {get_enum_key(action_obj.action_name)} --params {json.dumps(request_data)}"
        )
        if communicate_resp.return_code != 0:
            return {
                "execute_action": {"success": False, "error": communicate_resp.output}
            }
        return communicate_resp.output
