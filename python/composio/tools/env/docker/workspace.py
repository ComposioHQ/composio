"""
Docker workspace.
"""

import os
import socket
import time
import typing as t
from pathlib import Path

import requests
from docker import DockerClient, from_env
from docker.errors import DockerException, NotFound
from docker.models.containers import Container

from composio.exceptions import ComposioSDKError
from composio.tools.env.base import (
    ENV_GITHUB_ACCESS_TOKEN,
    RemoteWorkspace,
    _read_env_var,
)
from composio.tools.env.constants import ENV_COMPOSIO_DEV_MODE, ENV_COMPOSIO_SWE_AGENT


COMPOSIO_PATH = Path(__file__).parent.parent.parent.parent.parent.resolve()
COMPOSIO_CACHE = Path.home() / ".composio"
CONTAINER_DEV_VOLUMES = {
    COMPOSIO_PATH: {
        "bind": "/opt/composio-core",
        "mode": "rw",
    },
    COMPOSIO_CACHE: {
        "bind": "/root/.composio",
        "mode": "rw",
    },
}
DEV_MODE = os.environ.get(ENV_COMPOSIO_DEV_MODE, "0") == "1"
DEFAULT_IMAGE = "angrybayblade/composio"
DEFAULT_PORT = 54321


def _get_free_port() -> int:
    sock = socket.socket()
    try:
        sock.bind(("", 0))
        return sock.getsockname()[1]
    finally:
        sock.close()


class DockerWorkspace(RemoteWorkspace):
    """Docker workspace implementation."""

    port: int

    _container: Container
    _client: t.Optional[DockerClient] = None

    def __init__(
        self,
        image: t.Optional[str] = None,
        composio_api_key: t.Optional[str] = None,
        composio_base_url: t.Optional[str] = None,
        github_access_token: t.Optional[str] = None,
        environment: t.Optional[t.Dict] = None,
    ) -> None:
        """Create a docker workspace."""
        super().__init__(
            composio_api_key=composio_api_key,
            composio_base_url=composio_base_url,
            github_access_token=_read_env_var(
                name=ENV_GITHUB_ACCESS_TOKEN,
                default=github_access_token,
            ),
            environment=environment,
        )
        self.image = image or os.environ.get(ENV_COMPOSIO_SWE_AGENT, DEFAULT_IMAGE)

    def setup(self) -> None:
        """Setup docker workspace."""
        self.logger.info(f"Creating docker workspace with image: {self.image}")
        self.port = _get_free_port()
        self.url = f"http://localhost:{self.port}/api"

        container_kwargs: t.Dict[str, t.Any] = {
            "tty": True,
            "detach": True,
            "stdin_open": True,
            "auto_remove": False,
            "image": self.image,
            "name": self.id,
            "environment": self.environment,
            "command": "/root/entrypoint.sh",
            "ports": {
                8000: self.port,
            },
        }
        if DEV_MODE:
            container_kwargs["volumes"] = CONTAINER_DEV_VOLUMES
            container_kwargs["environment"][ENV_COMPOSIO_DEV_MODE] = "1"

        try:
            self._container = self.client.containers.run(**container_kwargs)
            self._container.start()
        except DockerException as e:
            raise ComposioSDKError("Error starting workspace: ", e) from e

        self._wait()

    def _wait(self) -> None:
        """Wait for docker workspace to get started."""
        while True:
            try:
                if self._request(endpoint="", method="get").status_code == 200:
                    return
            except requests.ConnectionError:
                time.sleep(0.1)

    @property
    def client(self) -> DockerClient:
        """Docker client object."""
        if self._client is None:
            try:
                self._client = from_env(timeout=100)
            except DockerException as e:
                raise ComposioSDKError(
                    message=f"Error initializing docker client: {e}. "
                    "Please make sure docker is running and try again."
                ) from e
        return self._client

    def teardown(self) -> None:
        """Teardown docker workspace factory."""
        super().teardown()
        try:
            self._container.kill()
            self._container.remove()
        except NotFound as e:
            self.logger.debug(f"Error cleaning {self.id} - {e}")
