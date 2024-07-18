"""
FlyIO workspace implementation.
"""

import typing as t
from dataclasses import dataclass

from composio.tools.env.base import RemoteWorkspace, WorkspaceConfigType
from composio.tools.env.flyio.client import FlyIO


@dataclass
class Config(WorkspaceConfigType):
    """Host configuration type."""

    image: t.Optional[str] = None
    """Docker image to use for creating workspace."""

    token: t.Optional[str] = None
    """FlyIO API token."""


class FlyIOWorkspace(RemoteWorkspace):
    """FlyIO Workspace."""

    flyio: FlyIO

    def __init__(self, config: Config):
        """Initialize FlyIO workspace."""
        super().__init__(config=config)
        self.image = config.image
        self.token = config.token

    def setup(self) -> None:
        """Setup workspace."""
        self.flyio = FlyIO(
            access_token=self.access_token,
            image=self.image,
            flyio_token=self.token,
            environment=self.environment,
        )
        self.flyio.setup()
        self.url = self.flyio.url

    def teardown(self) -> None:
        """Teardown E2B workspace."""
        super().teardown()
        if hasattr(self, "flyio"):
            self.flyio.teardown()
