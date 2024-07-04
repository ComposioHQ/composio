"""
Docker workspace.
"""

import os
import typing as t
from composio.utils.logging import get as get_logger

from docker import DockerClient, from_env
from docker.errors import DockerException

from composio.client.enums import Action
from composio.exceptions import ComposioSDKError
from composio.tools.env.base import Workspace
from composio.tools.env.docker.shell import DockerShell
from composio.tools.env.id import generate_id


DEFAULT_IMAGE = "sweagent/swe-agent"


class DockerWorkspace(Workspace):
    """Docker workspace implementation."""

    _shell_cls = DockerShell
    _client: t.Optional[DockerClient] = None

    def __init__(self, image: t.Optional[str] = None) -> None:
        """Create a docker workspace."""
        self.id = generate_id()
        logger = get_logger(name="docker_workspace")
        logger.info(f"Creating docker workspace with image: {image}")
        self._image = image or os.environ.get("COMPOSIO_SWE_AGENT", DEFAULT_IMAGE)
        logger.info(f"Using image: {self._image}")
        self._container = self.client.containers.run(
            image=self._image,
            command="/bin/bash -l -m",
            name=self.id,
            tty=True,
            detach=True,
            stdin_open=True,
            auto_remove=False,
        )
        self._container.start()

    def _create_shell(self) -> DockerShell:
        """Create docker shell."""
        return DockerShell(container=self._container)

    @property
    def client(self) -> DockerClient:
        """Docker client object."""
        if self._client is None:
            try:
                self._client = from_env()
            except DockerException as e:
                raise ComposioSDKError(message=f"Error initializing docker client: {e}")
        return self._client

    def execute_action(
        self,
        action_obj: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action in docker workspace."""
        return {}
