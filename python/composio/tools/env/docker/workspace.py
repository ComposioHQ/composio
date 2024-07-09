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
from composio.tools.env.constants import EXIT_CODE, STDOUT
from composio.tools.env.docker.shell import Container as DockerContainer
from composio.tools.env.docker.shell import DockerShell
from composio.tools.local.handler import LocalClient


DEFAULT_IMAGE = "techcomposio/swe-agent"
script_path = os.path.dirname(os.path.realpath(__file__))
composio_core_path = Path(script_path).parent.parent.parent.parent.absolute()
composio_local_store_path = Path.home() / ".composio"


class DockerWorkspace(Workspace):
    """Docker workspace implementation."""

    _container: DockerContainer
    _client: t.Optional[DockerClient] = None

    def __init__(self, image: t.Optional[str] = None) -> None:
        """Create a docker workspace."""
        super().__init__()
        self._image = image or os.environ.get("COMPOSIO_SWE_AGENT", DEFAULT_IMAGE)
        self.logger.info(f"Creating docker workspace with image: {self._image}")
        composio_swe_env = os.environ.get("COMPOSIO_SWE_ENV")
        container_args = {
            "image": self._image,
            "command": "/bin/bash -l -m",
            "name": self.id,
            "tty": True,
            "detach": True,
            "stdin_open": True,
            "auto_remove": False,
        }
        try:
            if composio_swe_env == "dev":
                container_args.update(
                    {
                        "environment": {"ENV": "dev"},
                        "volumes": {
                            composio_core_path: {
                                "bind": "/opt/composio-core",
                                "mode": "rw",
                            },
                            composio_local_store_path: {
                                "bind": "/root/.composio",
                                "mode": "rw",
                            },
                        },
                    }
                )
            self._container = self.client.containers.run(**container_args)
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
            f" --params '{json.dumps(request_data)}'"
            f" --metadata '{json.dumps(metadata)}'"
        )
        if len(output[EXIT_CODE]) != 0:
            return {"status": "failure", "message": output["stderr"]}
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
