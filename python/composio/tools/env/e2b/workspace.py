"""E2B Workspace."""

import os
import time
import typing as t
from dataclasses import dataclass
from uuid import uuid4

from composio.exceptions import ComposioSDKError
from composio.tools.env.base import RemoteWorkspace, WorkspaceConfigType


try:
    import requests
    from e2b import Sandbox

    E2B_INSTALLED = True
except ImportError:
    Sandbox = t.Any
    E2B_INSTALLED = False


TOOLSERVER_PORT = 8000
TOOLSERVER_URL = "https://{host}/api"

DEFAULT_TEMPLATE = "2h9ws7lsk32jyow50lqz"
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
        if not E2B_INSTALLED:
            raise ComposioSDKError(
                "`e2b` is required to use e2b workspace, "
                "run `pip3 install composio-core[e2b]` or "
                "`pip3 install e2b e2b-code-interpreter` to install",
            )

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

    def _wait(self) -> None:
        deadline = time.time() + float(os.environ.get("WORKSPACE_WAIT_TIMEOUT", 60.0))
        while time.time() < deadline:
            try:
                if (
                    self._request(endpoint="", method="get", log=False).status_code
                    == 200
                ):
                    return
            except requests.ConnectionError:
                time.sleep(1)

    def setup(self) -> None:
        """Start toolserver."""
        # Start sandbox
        self.sandbox = Sandbox(template=self.template, api_key=self.api_key)
        self.url = TOOLSERVER_URL.format(host=self.sandbox.get_host(self.port))
        self.logger.debug(f"{self}.url = {self.url}")

        # Start app update in background
        self.sandbox.commands.run(
            cmd="composio apps update",
            envs=self.environment,
            background=False,
        )

        # Setup SSH server
        _ssh_password = uuid4().hex.replace("-", "")
        self.sandbox.commands.run(
            cmd=f"echo user:{_ssh_password} | sudo chpasswd",
            envs=self.environment,
            background=False,
        )
        self.sandbox.commands.run(
            cmd="sudo service ssh restart",
            envs=self.environment,
            background=False,
        )
        self.sandbox.commands.run(
            cmd=(
                f"COMPOSIO_LOGGING_LEVEL=debug "
                f"_SSH_USERNAME=user _SSH_PASSWORD={_ssh_password} "
                f"composio serve -h '0.0.0.0' -p {self.port}"
            ),
            envs=self.environment,
            background=True,
        )
        self.host = self.sandbox.get_host(port=80)
        self.ports = []
        self._wait()

    def teardown(self) -> None:
        """Teardown E2B workspace."""
        super().teardown()
        if hasattr(self, "sandbox"):
            self.sandbox.kill()
