"""
Docker workspace.
"""

import os
import socket
import time
import typing as t
from pathlib import Path
from uuid import uuid4

import requests
from docker import DockerClient, from_env
from docker.errors import DockerException

from composio.client.enums import Action
from composio.constants import ENV_COMPOSIO_API_KEY, ENV_COMPOSIO_BASE_URL
from composio.exceptions import ComposioSDKError
from composio.tools.env.base import Shell, Workspace
from composio.tools.env.constants import ENV_COMPOSIO_DEV_MODE, ENV_COMPOSIO_SWE_AGENT
from composio.tools.local.handler import get_runtime_action


COMPOSIO_PATH = Path(__file__).parent.parent.parent.parent.resolve()
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


class DockerWorkspace(Workspace):
    """Docker workspace implementation."""

    _client: t.Optional[DockerClient] = None

    def __init__(
        self,
        image: t.Optional[str] = None,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
    ) -> None:
        """Create a docker workspace."""
        super().__init__(api_key=api_key, base_url=base_url)
        self.access_token = "".join(uuid4().hex.split("-"))
        self.image = image or os.environ.get(ENV_COMPOSIO_SWE_AGENT, DEFAULT_IMAGE)
        self.port = _get_free_port()
        self.url = f"http://localhost:{self.port}/api"

        self._setup()
        self._wait()

    def _setup(self) -> None:
        """Setup docker workspace."""
        self.logger.info(f"Creating docker workspace with image: {self.image}")
        container_kwargs: t.Dict[str, t.Any] = {
            "tty": True,
            "detach": True,
            "stdin_open": True,
            "auto_remove": False,
            "image": self.image,
            "name": self.id,
            "environment": {
                "ACCESS_TOKEN": self.access_token,
                "GITHUB_ACCESS_TOKEN": os.environ.get(
                    "GITHUB_ACCESS_TOKEN",
                ),
                ENV_COMPOSIO_API_KEY: self._api_key,
                ENV_COMPOSIO_BASE_URL: self._base_url,
            },
            "command": "/root/entrypoint.sh",
            "ports": {8000: self.port},
        }
        if DEV_MODE:
            container_kwargs["volumes"] = CONTAINER_DEV_VOLUMES
            container_kwargs["environment"][ENV_COMPOSIO_DEV_MODE] = "1"

        try:
            self._container = self.client.containers.run(**container_kwargs)
            self._container.start()
        except Exception as e:
            raise Exception("Error starting workspace: ", e) from e

    def _wait(self) -> None:
        """Wait for docker workspace to get started."""
        while True:
            try:
                if self._request(endpoint="", method="get").status_code == 200:
                    return
            except requests.ConnectionError:
                time.sleep(1)

    def _create_shell(self) -> Shell:
        """Create docker shell."""
        raise RuntimeError("Creating shell is not allowed for docker workspaces")

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

    def _request(
        self,
        endpoint: str,
        method: str,
        json: t.Optional[t.Dict] = None,
        timeout: t.Optional[float] = 15.0,
    ) -> requests.Response:
        """Make request to the tooling server."""
        return requests.request(
            url=f"{self.url}{endpoint}",
            method=method,
            json=json,
            headers={
                "x-api-key": self.access_token,
            },
            timeout=timeout,
        )

    def _upload(self, action: Action) -> None:
        """Upload action instance to tooling server."""
        obj = get_runtime_action(name=action.name)
        request = self._request(
            method="post",
            endpoint="/tools",
            json={
                "content": Path(str(obj.module)).read_text(encoding="utf-8"),
                "filename": Path(str(obj.module)).name,
                "dependencies": obj.requires or {},
            },
            timeout=300.0,
        )
        response = request.json()
        if response["error"] is not None:
            self.logger.error(
                f"Error while uploading {action.slug}: " + response["error"]
            )
        else:
            self.logger.debug(
                f"Succesfully uploaded: {action.slug}",
            )

    def execute_action(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action in docker workspace."""
        if action.is_runtime:
            self._upload(action=action)

        request = self._request(
            method="post",
            endpoint=f"/actions/execute/{action.slug}",
            json={
                "params": request_data,
                "metadata": metadata,
            },
            timeout=300.0,
        )
        response = request.json()
        if response["error"] is None:
            return response["data"]
        raise RuntimeError(f"Error while executing {action.slug}: " + response["error"])

    def teardown(self) -> None:
        """Teardown docker workspace factory."""
        super().teardown()
        self._container.kill()
        self._container.remove()
