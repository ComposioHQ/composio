import os
import select
import time
import traceback
from enum import Enum
from subprocess import PIPE, Popen, STDOUT
from typing import List, Set, Tuple

import docker

from composio.workspace.get_logger import get_logger


logger = get_logger("workspace")

START_UP_DELAY = 5
TIMEOUT_DURATION = 25
EXIT_CMD = "exit"


class WorkspaceType(Enum):
    DOCKER = "docker"
    E2B = "e2b"
    FLYIO = "flyio"


class E2BClient:
    def __init__(self):
        pass


class FlyIoClient:
    def __init__(self):
        pass


class DockerIoClient:
    def __init__(self):
        self.docker_client = None
        self.docker_client = self.get_client()

    def get_client(self):
        if self.docker_client is None:  # pylint: disable=E0203
            try:
                self.docker_client = docker.from_env()
            except docker.errors.DockerException as e:
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
    ) -> Tuple[Popen, Set]:
        filtered_images = self.docker_client.images.list(
            filters={"reference": image_name}
        )

        if not filtered_images:
            msg = (
                f"Image {image_name} not found. Please ensure it is built and available. "
                "Please double-check that you followed all installation/setup instructions from the "
                "readme."
            )
            raise RuntimeError(msg)
        if len(filtered_images) > 1:
            logger.warning("Multiple images found for %s, that's weird.", image_name)

        # attrs = filtered_images[0].attrs
        # if attrs:
        #     logger.info(
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
        filtered_images = self.docker_client.images.list(
            filters={"reference": image_name}
        )
        if len(filtered_images) == 0:
            msg = (
                f"Image {image_name} not found. Please ensure it is built and available. "
                "Please double-check that you followed all installation/setup instructions from the "
                "readme."
            )
            raise RuntimeError(msg)
        if len(filtered_images) > 1:
            logger.warning("Multiple images found for %s, that's weird.", image_name)
        # attrs = filtered_images[0].attrs
        # if attrs is not None:
        #     logger.info(
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
                container_obj = self.docker_client.containers.get(container_name)
                return container_obj
            except docker.errors.NotFound:
                logger.debug("Couldn't find container. Let's wait and retry.")
                time.sleep(backoff_time)
                backoff_time *= 2
                attempt += 1
        raise RuntimeError(
            f"Failed to find container {container_name} after {max_attempts} attempts."
        )

    def _get_persistent_container(
        self, ctr_name: str, image_name: str
    ) -> Tuple[Popen, Set]:
        containers = self.get_client().containers.list(
            all=True, filters={"name": ctr_name}
        )
        if ctr_name in [c.name for c in containers]:
            container_obj = self.get_client().containers.get(ctr_name)
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
            container_obj = self.get_client().containers.run(
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
        # logger.debug("Starting container with command: %s", shlex.join(startup_cmd))
        # pylint: disable=R1732
        container = Popen(
            startup_cmd,
            stdin=PIPE,
            stdout=PIPE,
            stderr=STDOUT,
            text=True,
            bufsize=1,  # line buffered
        )
        time.sleep(START_UP_DELAY)
        # try to read output from container setup (usually an error), timeout if no output
        output = read_with_timeout(
            container, None, lambda arge1, arg2: [], [], timeout_duration=2
        )
        if output:
            logger.error("Unexpected container setup output: %s", output)
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
    ) -> Tuple[Popen, Set]:
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
        # logger.debug("Starting container with command: %s", shlex.join(startup_cmd))
        container = Popen(  # pylint: disable=consider-using-with
            startup_cmd,
            stdin=PIPE,
            stdout=PIPE,
            stderr=STDOUT,
            text=True,
            bufsize=1,  # line buffered
        )
        time.sleep(START_UP_DELAY)
        # try to read output from container setup (usually an error), timeout if no output
        output = read_with_timeout(
            container, None, lambda arg1, arg2: [], [], timeout_duration=2
        )
        if output:
            logger.error("Unexpected container setup output: %s", output)
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
            logger.error(
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
            logger.error("Read with timeout failed on input:\n---\n%s\n---", input)
            raise e
        if not exit_code.isdigit():
            raise RuntimeError(
                f"Container crashed. Failed to get exit code. Output:\n---\n{buffer}\n---"
            )
        return_code = int(exit_code)
        return buffer, return_code

    def communicate(
        self,
        container: Popen,
        container_obj,
        input_cmd: str,
        parent_pids: List[str],
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
        container_process: Popen,
        container_obj,
        cmd_input: str,
        parent_pids: List[str],
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
            logger.error("%s: %s", error_msg, logs)
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
