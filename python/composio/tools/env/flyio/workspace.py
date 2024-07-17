"""
FlyIO workspace implementation.
"""

import typing as t
from uuid import uuid4

from composio.tools.env.base import (
    ENV_GITHUB_ACCESS_TOKEN,
    RemoteWorkspace,
    _read_env_var,
)
from composio.tools.env.flyio.client import FlyIO


class FlyIOWorkspace(RemoteWorkspace):
    """FlyIO Workspace."""

    flyio: FlyIO

    def __init__(
        self,
        image: t.Optional[str] = None,
        flyio_token: t.Optional[str] = None,
        composio_api_key: t.Optional[str] = None,
        composio_base_url: t.Optional[str] = None,
        github_access_token: t.Optional[str] = None,
        environment: t.Optional[t.Dict] = None,
    ):
        """Initialize FlyIO workspace."""
        super().__init__(
            composio_api_key=composio_api_key,
            composio_base_url=composio_base_url,
            github_access_token=_read_env_var(
                name=ENV_GITHUB_ACCESS_TOKEN,
                default=github_access_token,
            ),
            environment=environment,
        )
        self.image = image
        self.flyio_token = flyio_token
        self.access_token = "".join(uuid4().hex.split("-"))

    def setup(self) -> None:
        """Setup workspace."""
        self.flyio = FlyIO(
            access_token=self.access_token,
            image=self.image,
            flyio_token=self.flyio_token,
            environment=self.environment,
        )
        self.flyio.setup()
        self.url = self.flyio.url

    def teardown(self) -> None:
        """Teardown E2B workspace."""
        super().teardown()
        if hasattr(self, "flyio"):
            self.flyio.teardown()
