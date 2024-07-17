"""E2B Workspace."""

import os
import time
import typing as t
from uuid import uuid4

from e2b import Sandbox

from composio.tools.env.base import (
    ENV_GITHUB_ACCESS_TOKEN,
    RemoteWorkspace,
    _read_env_var,
)


DEFAULT_TEMPLATE = "2h9ws7lsk32jyow50lqz"

TOOLSERVER_PORT = 8000
TOOLSERVER_URL = "https://{host}/api"


ENV_E2B_TEMPLATE = "E2B_TEMPLATE"


class E2BWorkspace(RemoteWorkspace):
    """Create and manage E2B workspace."""

    def __init__(
        self,
        port: t.Optional[int] = None,
        template: t.Optional[str] = None,
        composio_api_key: t.Optional[str] = None,
        composio_base_url: t.Optional[str] = None,
        github_access_token: t.Optional[str] = None,
        environment: t.Optional[t.Dict] = None,
    ):
        """Initialize E2B workspace."""
        super().__init__(
            composio_api_key=composio_api_key,
            composio_base_url=composio_base_url,
            github_access_token=_read_env_var(
                name=ENV_GITHUB_ACCESS_TOKEN,
                default=github_access_token,
            ),
            environment=environment,
        )

        if template is None:
            template = os.environ.get(ENV_E2B_TEMPLATE)
            if template is not None:
                self.logger.debug(f"Using E2B template `{template}` from environment")
            template = template or DEFAULT_TEMPLATE

        self.port = port or TOOLSERVER_PORT
        self.template = template
        self.setup()

    def setup(self) -> None:
        """Start toolserver."""
        # Start sandbox
        self.sandbox = Sandbox(template=self.template, env_vars=self.environment)
        self.url = TOOLSERVER_URL.format(host=self.sandbox.get_hostname(self.port))

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
                f"cd /home/{_ssh_username} && COMPOSIO_LOGGING_LEVEL=debug "
                f"_SSH_USERNAME={_ssh_username} _SSH_PASSWORD={_ssh_password} "
                f"composio serve -h '0.0.0.0' -p {self.port}"
            ),
        )
        while self._request(endpoint="", method="get").status_code != 200:
            time.sleep(1)
        process.wait()

    def teardown(self) -> None:
        """Teardown E2B workspace."""
        super().teardown()
        self.sandbox.close()
