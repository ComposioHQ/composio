"""
Docker workspace.
"""

import json
import os
import typing as t

from docker import DockerClient, from_env
from docker.errors import DockerException

from composio.client.enums import Action
from composio.exceptions import ComposioSDKError
from composio.tools.env.base import Workspace
from composio.tools.env.docker.shell import DockerShell
from composio.tools.local.handler import LocalClient


DEFAULT_IMAGE = "sweagent/swe-agent"


class DockerWorkspace(Workspace):
    """Docker workspace implementation."""

    _shell_cls = DockerShell
    _client: t.Optional[DockerClient] = None

    def __init__(self, image: t.Optional[str] = None) -> None:
        """Create a docker workspace."""
        super().__init__()
        self._image = image or os.environ.get("COMPOSIO_SWE_AGENT", DEFAULT_IMAGE)
        self.logger.info(f"Creating docker workspace with image: {self._image}")
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
                raise ComposioSDKError(
                    message=f"Error initializing docker client: {e}"
                ) from e
        return self._client

    def _execute_shell(
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action using shell."""
        return (
            LocalClient()
            .get_action(action=action)
            .execute_action(
                request_data=request_data,
                metadata={
                    **metadata,
                    "workspace": self,
                },
            )
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
            f" --param {json.dumps(request_data)}"
            f" --metadata {json.dumps(metadata)}"
        )
        if len(output["stderr"]) > 0:
            return {"status": "failure", "message": output["stderr"]}
        try:
            return {"status": "success", "data": json.loads(output["stdout"])}
        except json.JSONDecodeError:
            return {"status": "failure", "message": output["stdout"]}

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
