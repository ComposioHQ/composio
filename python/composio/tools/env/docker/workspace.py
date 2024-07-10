"""
Docker workspace.
"""

import json
import os
import typing as t
from pathlib import Path

from docker import DockerClient, from_env
from docker.errors import DockerException

from composio.client.enums import Action
from composio.exceptions import ComposioSDKError
from composio.tools.env.base import Workspace
from composio.tools.env.constants import (
    DEFAULT_IMAGE,
    ENV_COMPOSIO_DEV_MODE,
    ENV_COMPOSIO_SWE_AGENT,
    EXIT_CODE,
    STDERR,
    STDOUT,
)
from composio.tools.env.docker.shell import Container as DockerContainer
from composio.tools.env.docker.shell import DockerShell
from composio.tools.local.handler import LocalClient


COMPOSIO_PATH = Path(__file__).parent.parent.parent.parent.resolve()
COMPOSIO_CACHE = Path.home() / ".composio"

CONTAINER_BASE_KWARGS = {
    "command": "/bin/bash -l -m",
    "tty": True,
    "detach": True,
    "stdin_open": True,
    "auto_remove": False,
}
CONTAINER_DEVELOPMENT_MODE_KWARGS = {
    "environment": {ENV_COMPOSIO_DEV_MODE: 1},
    "volumes": {
        COMPOSIO_PATH: {
            "bind": "/opt/composio-core",
            "mode": "rw",
        },
        COMPOSIO_CACHE: {
            "bind": "/root/.composio",
            "mode": "rw",
        },
    },
}


class DockerWorkspace(Workspace):
    """Docker workspace implementation."""

    _container: DockerContainer
    _client: t.Optional[DockerClient] = None

    def __init__(self, image: t.Optional[str] = None) -> None:
        """Create a docker workspace."""
        super().__init__()
        self._image = image or os.environ.get(ENV_COMPOSIO_SWE_AGENT, DEFAULT_IMAGE)
        self.logger.info(f"Creating docker workspace with image: {self._image}")
        try:
            container_kwargs = {
                "image": self._image,
                "name": self.id,
                **CONTAINER_BASE_KWARGS,
            }
            if os.environ.get(ENV_COMPOSIO_DEV_MODE, 0) != 0:
                container_kwargs.update(CONTAINER_DEVELOPMENT_MODE_KWARGS)
            self._container = self.client.containers.run(**container_kwargs)
            self._container.start()
        except Exception as e:
            raise Exception("exception in starting container: ", e) from e

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
                raise ComposioSDKError(
                    message=f"Error initializing docker client: {e}. "
                    "Please make sure docker is running and try again."
                ) from e
        return self._client

    def _execute_shell(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action using shell."""
        return LocalClient().execute_action(
            action=action,
            request_data=request_data,
            metadata={
                **metadata,
                "workspace": self,
            },
        )

    def _execute_cli(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action using CLI"""
        output = self.shells.recent.exec(
            f"composio execute {action.slug}"
            f" --params '{json.dumps(request_data)}'"
            f" --metadata '{json.dumps(metadata)}'"
        )
        if output[EXIT_CODE] != 0:
            return {"status": "failure", "message": output[STDERR]}
        try:
            return {"status": "success", "data": json.loads(output[STDOUT])}
        except json.JSONDecodeError:
            return {"status": "failure", "message": output[STDOUT]}

    def execute_action(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action in docker workspace."""
        if action.shell:
            return self._execute_shell(
                action=action,
                request_data=request_data,
                metadata=metadata,
            )
        return self._execute_cli(
            action=action,
            request_data=request_data,
            metadata=metadata,
        )

    def teardown(self) -> None:
        """Teardown docker workspace factory."""
        super().teardown()
        self._container.kill()
        self._container.remove()
