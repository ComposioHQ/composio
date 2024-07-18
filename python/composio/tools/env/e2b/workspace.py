"""E2B Workspace."""

import os
import time
import typing as t
from dataclasses import dataclass
from uuid import uuid4

from e2b import Sandbox

from composio.tools.env.base import RemoteWorkspace, WorkspaceConfigType


DEFAULT_TEMPLATE = "2h9ws7lsk32jyow50lqz"

TOOLSERVER_PORT = 8000
TOOLSERVER_URL = "https://{host}/api"


ENV_E2B_TEMPLATE = "E2B_TEMPLATE"


@dataclass
class Config(WorkspaceConfigType):
    """Host configuration type."""

    template: t.Optional[str] = None
    """Template ID for creating the sandbox, if not provided the composio tooling server template will be used."""

    api_key: t.Optional[str] = None
    """E2B API Key."""

    port: t.Optional[int] = None
    """Port for launching the toolserver on the E2B sandbox."""


class E2BWorkspace(RemoteWorkspace):
    """Create and manage E2B workspace."""

    sandbox: Sandbox

    def __init__(self, config: Config):
        """Initialize E2B workspace."""
        super().__init__(config=config)
        template = config.template
        if template is None:
            template = os.environ.get(ENV_E2B_TEMPLATE)
            if template is not None:
                self.logger.debug(f"Using E2B template `{template}` from environment")
            template = template or DEFAULT_TEMPLATE

        self.template = template
        self.api_key = config.api_key
        self.port = config.port or TOOLSERVER_PORT

    def setup(self) -> None:
        """Start toolserver."""
        # Start sandbox
        self.sandbox = Sandbox(
            template=self.template,
            env_vars=self.environment,
            api_key=self.api_key,
        )
        self.url = TOOLSERVER_URL.format(
            host=self.sandbox.get_hostname(self.port),
        )

        # Start app update in background
        process = self.sandbox.process.start(
            cmd="composio apps update",
        )

        # TOFIX: Do not use random user every time
        # Setup SSH server
        _ssh_username = uuid4().hex.replace("-", "")
        _ssh_password = uuid4().hex.replace("-", "")
        self.sandbox.process.start(
            cmd=(
                f"sudo useradd -rm -d /home/{_ssh_username} -s "
                f"/bin/bash -g root -G sudo {_ssh_username}"
            ),
        )
        self.sandbox.process.start(
            cmd=f"echo {_ssh_username}:{_ssh_password} | sudo chpasswd"
        )
        self.sandbox.process.start(cmd="sudo service ssh restart")
        self.sandbox.process.start(
            cmd=(
                f"_SSH_USERNAME={_ssh_username} _SSH_PASSWORD={_ssh_password} "
                f"COMPOSIO_LOGGING_LEVEL=debug composio serve -h '0.0.0.0' -p {self.port}"
            ),
        )
        while self._request(endpoint="", method="get").status_code != 200:
            time.sleep(1)
        process.wait()

    def teardown(self) -> None:
        """Teardown E2B workspace."""
        super().teardown()
        self.sandbox.close()
