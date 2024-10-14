"""
FlyIO workspace implementation.
"""

import typing as t
from dataclasses import dataclass
from urllib.parse import urlparse

from composio.exceptions import ComposioSDKError
from composio.tools.env.base import RemoteWorkspace, WorkspaceConfigType
from composio.tools.env.flyio.client import (
    FLYIO_DEPENDENCIES_INSTALLED,
    FlyIO,
    PortRequest,
)


@dataclass
class Config(WorkspaceConfigType):
    """Host configuration type."""

    image: t.Optional[str] = None
    """Docker image to use for creating workspace."""

    token: t.Optional[str] = None
    """FlyIO API token."""

    ports: t.Optional[t.List[PortRequest]] = None
    """Port requests."""


class FlyIOWorkspace(RemoteWorkspace):
    """FlyIO Workspace."""

    flyio: FlyIO

    def __init__(self, config: Config):
        """Initialize FlyIO workspace."""
        if not FLYIO_DEPENDENCIES_INSTALLED:
            raise ComposioSDKError(
                "`flyio` workspace dependencies are not installed"
                "run `pip3 install composio-core[flyio]` to install."
            )

        super().__init__(config=config)
        self.image = config.image
        self.token = config.token
        self._port_requests = config.ports or []

    def setup(self) -> None:
        """Setup workspace."""
        self.flyio = FlyIO(
            access_token=self.access_token,
            image=self.image,
            flyio_token=self.token,
            environment=self.environment,
            ports=self._port_requests,
        )
        self.flyio.setup()
        self.url = self.flyio.url
        self.host = t.cast(str, urlparse(url=self.url).hostname)

        ports = []
        for r in self._port_requests:
            ports += [p["port"] for p in r["ports"]]
        self.ports = ports

    def teardown(self) -> None:
        """Teardown E2B workspace."""
        super().teardown()
        if hasattr(self, "flyio"):
            self.flyio.teardown()
