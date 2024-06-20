import os
import select
import shlex
import subprocess
import tarfile
import tempfile
import time
import traceback
from io import BytesIO
from subprocess import PIPE, STDOUT
from typing import List, Optional, Set, Tuple

import docker

from composio.local_tools.local_workspace.commons.get_logger import get_logger


START_UP_DELAY = 5
TIMEOUT_DURATION = 25

logger = get_logger()


class DockerManager:
    _instance = None
    docker_client = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DockerManager, cls).__new__(cls)
            cls._instance.docker_client = None
        return cls._instance

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

    @classmethod
    def get_container(
        cls, ctr_name: str, image_name: str, persistent: bool = False
    ) -> Tuple[subprocess.Popen, Set]:
        instance = cls()
        client = instance.get_client()
        filtered_images = client.images.list(filters={"reference": image_name})

        if not filtered_images:
            msg = (
                f"Image {image_name} not found. Please ensure it is built and available. "
                "Please double-check that you followed all installation/setup instructions from the "
                "readme."
            )
            raise RuntimeError(msg)
        if len(filtered_images) > 1:
            logger.warning("Multiple images found for %s, that's weird.", image_name)

        attrs = filtered_images[0].attrs
        if attrs:
            logger.info(
                "Found image %s with tags: %s, created: %s for os: %s arch: %s.",
                image_name,
                attrs["RepoTags"],
                attrs["Created"],
                attrs["Os"],
                attrs["Architecture"],
            )

        if persistent:
            return instance._get_persistent_container(ctr_name, image_name)
        return instance._get_non_persistent_container(ctr_name, image_name)

    @classmethod
    def get_container_by_container_name(cls, container_name: str, image_name: str):
        instance = cls()
        filtered_images = instance.get_client().images.list(
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
        attrs = filtered_images[0].attrs
        if attrs is not None:
            logger.info(
                "Found image %s with tags: %s, created: %s for os: %s arch: %s.",
                image_name,
                attrs["RepoTags"],
                attrs["Created"],
                attrs["Os"],
                attrs["Architecture"],
            )
        max_attempts = 5
        attempt = 0
        backoff_time = 1  # Initial backoff time in seconds
        while attempt < max_attempts:
            try:
                container_obj = instance.get_client().containers.get(container_name)
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
    ) -> Tuple[subprocess.Popen, Set]:
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
        logger.debug("Starting container with command: %s", shlex.join(startup_cmd))
        # pylint: disable=R1732
        container = subprocess.Popen(
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
                f"Detected alien processes attached or running. Please ensure that no other agents are running on this container. PIDs: {bash_pids}, {other_pids}"
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
    ) -> Tuple[subprocess.Popen, Set]:
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
        logger.debug("Starting container with command: %s", shlex.join(startup_cmd))
        container = subprocess.Popen(  # pylint: disable=consider-using-with
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


def get_container(
    ctr_name: str, image_name: str, persistent: bool = False
) -> Tuple[subprocess.Popen, Set]:
    logger.info("is persistent container: %s", persistent)
    return DockerManager.get_container(ctr_name, image_name)


def get_container_by_container_name(container_name: str, image_name: str):
    return DockerManager.get_container_by_container_name(container_name, image_name)


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


def read_with_timeout(
    container, container_obj, pid_func, parent_pids, timeout_duration
):
    """
    Read data from a subprocess with a timeout.
    This function uses a file descriptor to read data from the subprocess in a non-blocking way.

    Args:
        container (subprocess.Popen): The subprocess container.
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


def copy_file_to_container(container_obj, contents, container_path):
    """
    Copies a given string into a Docker container at a specified path.

    Args:
    - container: Docker SDK container object.
    - contents: The string to copy into the container.
    - container_path: The path inside the container where the string should be copied to.

    Returns:
    - None
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
                    container_obj.put_archive(
                        path=os.path.dirname(container_path), data=tar_stream.read()
                    )

    except Exception as e:
        logger.error("An error occurred: %s", e)
        logger.error(traceback.format_exc())
    finally:
        # Cleanup: Remove the temporary file if it was created
        if temp_file_name and os.path.exists(temp_file_name):
            os.remove(temp_file_name)


def process_output(output: str, return_code: Optional[int]):
    if return_code is None:
        return_code = 1
        output = "Exception: " + output
    return output, return_code


def communicate(
    container: subprocess.Popen,
    container_obj,
    input_cmd: str,
    parent_pids: List[str],
    timeout_duration=25,
):
    return_code = None
    if input_cmd.strip() != "exit":
        output, valid = _check_syntax(container, container_obj, input_cmd, parent_pids)
        if not valid:
            return output, return_code  # shows syntax errors
        output, return_code = _communicate(
            container,
            container_obj,
            input_cmd,
            parent_pids,
            timeout_duration=timeout_duration,
        )
        return output, return_code
    # if input_cmd = "exit" --> terminate container and exit
    terminate_container(container)
    return_code = 0
    return "", return_code


def communicate_with_handling(
    container_process: subprocess.Popen,
    container_obj,
    input: str,
    parent_pids: List[str],
    error_msg: str,
    timeout_duration=25,
) -> str:
    """
    Wrapper for communicate function that raises error if return code is non-zero
    """
    logs, return_code = communicate(
        container_process,
        container_obj,
        input,
        parent_pids,
        timeout_duration=timeout_duration,
    )
    if return_code != 0:
        logger.error("%s: %s", error_msg, logs)
        # call close container here in future
        # self.close()
        raise RuntimeError(f"{error_msg}: {logs}")
    return logs


def _check_syntax(container, container_obj, input: str, parent_pids):
    """
    Saves environment variables to file
    """
    output, return_code = _communicate(
        container, container_obj, f"/bin/bash -n <<'EOF'\n{input}\nEOF\n", parent_pids
    )
    return output, return_code == 0


def _communicate(
    container, container_obj, input: str, parent_pids, timeout_duration=25
):
    return_code = None
    try:
        cmd = input if input.endswith("\n") else input + "\n"
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


def terminate_container(container):
    # pylint: disable=unused-argument
    pass


# todo: implement this function --> used while running a command on container
def interrupt_container(container_process, container_obj):
    # pylint: disable=unused-argument
    pass


def close_container(container_process, container_obj):
    # pylint: disable=unused-argument
    pass
