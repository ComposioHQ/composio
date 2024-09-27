"""
FlyIO workspace implementation.
"""

import typing as t
from dataclasses import dataclass
from urllib.parse import urlparse

from composio.client import Composio
from composio.client.collections import ComposioWorkspaceStatus
from composio.tools.env.base import RemoteWorkspace, WorkspaceConfigType
from composio.tools.env.flyio.client import PortRequest


@dataclass
class Config(WorkspaceConfigType):
    """Host configuration type."""

    image: t.Optional[str] = None
    """Docker image to use for creating workspace."""

    ports: t.Optional[t.List[PortRequest]] = None
    """Port requests."""


class ComposioWorkspace(RemoteWorkspace):
    """Composio Workspace."""

    def __init__(self, config: Config):
        """Initialize FlyIO workspace."""
        super().__init__(config=config)
        self.image = config.image
        self._port_requests = config.ports or []
        self.client = Composio.get_latest()

    def setup(self) -> None:
        """Setup workspace."""
        self.id = self.client.workspaces.create(
            access_token=self.access_token,
            composio_api_key=self.composio_api_key,
            composio_base_url=self.composio_base_url,
            github_access_token=self.github_access_token,  # type: ignore
            environment=self.environment,  # type: ignore
            ports=self._port_requests,  # type: ignore
        )
        self.client.workspaces.start(id=self.id)
        self.client.workspaces.wait(
            id=self.id,
            status=ComposioWorkspaceStatus.RUNNING,
            timeout=300.0,
            interval=5.0,
        )

        self.url = f"https://composio-{self.id}.fly.dev:8000/api"
        self.host = t.cast(str, urlparse(url=self.url).hostname)

        ports = []
        for r in self._port_requests:
            ports += [p["port"] for p in r["ports"]]
        self.ports = ports

    def teardown(self) -> None:
        """Teardown the workspace."""
        if self.persistent:
            return

        self.client.workspaces.stop(id=self.id)
        self.client.workspaces.wait(
            id=self.id,
            status=ComposioWorkspaceStatus.STOPPED,
            timeout=180.0,
        )
        self.client.workspaces.remove(id=self.id)
