import logging
from rich.logging import RichHandler

from pydantic.v1 import BaseModel, Field

import docker

LOGGER_NAME = "composio_logger"

handler = RichHandler(show_time=False, show_path=False)
handler.setLevel(logging.DEBUG)
logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.propagate = False

STATUS_RUNNING = "running"
STATUS_STOPPED = "stopped"


class DockerContainerStatusRequest(BaseModel):
    container_name: str = Field(..., description="locally running docker-container name")
    # image_name: str = Field(..., description="docker-image name from which docker-container is created")


class DockerContainerStatusResponse(BaseModel):
    container_status: str = Field(..., description="status of the docker container given in request")


class DockerContainerStatus:
    def __init__(self, args: DockerContainerStatusRequest):
        self.container_name = args.container_name
        # self.image_name = args.image_name

    def execute(self):
        client = docker.from_env()

        try:
            container = client.containers.get(self.container_name)
            if container.status == STATUS_RUNNING:
                return DockerContainerStatusResponse(container_status=STATUS_RUNNING)
            else:
                return DockerContainerStatusResponse(container_status=STATUS_STOPPED)
        except docker.errors.NotFound:
            return False
        except docker.errors.APIError as e:
            logger.error(f"Error checking container status: {e}")
            return DockerContainerStatusResponse(container_status=STATUS_STOPPED)


def execute_docker_status(args: DockerContainerStatusRequest):
    s = DockerContainerStatus(args)
    return s.execute()
