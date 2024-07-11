"""E2B Workspace."""

import os
import time
import typing as t
from pathlib import Path

import requests
from e2b import Sandbox

from composio.client.enums import Action
from composio.constants import ENV_COMPOSIO_API_KEY, ENV_COMPOSIO_BASE_URL
from composio.tools.env.base import Shell, Workspace
from composio.tools.local.handler import get_runtime_action


DEFAULT_TEMPLATE = "2h9ws7lsk32jyow50lqz"

TOOLSERVER_PORT = 8000
TOOLSERVER_URL = "https://{host}/api"

ENV_GITHUB_ACCESS_TOKEN = "GITHUB_ACCESS_TOKEN"


class E2BWorkspace(Workspace):
    """Create and manage E2B workspace."""

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        template: t.Optional[str] = None,
        port: t.Optional[int] = None,
        env: t.Optional[t.Dict[str, str]] = None,
    ):
        """Initialize E2B workspace."""
        super().__init__()
        self.api_key = api_key or os.environ.get(ENV_COMPOSIO_API_KEY)
        if self.api_key is None:
            raise ValueError(
                "`api_key` cannot be `None` when initializing E2BWorkspace"
            )

        self.base_url = base_url or os.environ.get(ENV_COMPOSIO_BASE_URL)
        if self.base_url is None:
            raise ValueError(
                "`base_url` cannot be `None` when initializing E2BWorkspace"
            )

        github_access_token = os.environ.get(ENV_GITHUB_ACCESS_TOKEN)
        if github_access_token is None:
            raise ValueError(
                f"Please export your github access token as `{ENV_GITHUB_ACCESS_TOKEN}`"
            )

        self.port = port or TOOLSERVER_PORT
        self.sandbox = Sandbox(
            template=template or DEFAULT_TEMPLATE,
            env_vars={
                **(env or {}),
                ENV_COMPOSIO_API_KEY: self.api_key,
                ENV_COMPOSIO_BASE_URL: self.base_url,
                ENV_GITHUB_ACCESS_TOKEN: github_access_token,
            },
        )
        self.url = TOOLSERVER_URL.format(
            host=self.sandbox.get_hostname(
                self.port,
            )
        )
        self._start_toolserver()

    def _start_toolserver(self) -> None:
        """Start toolserver."""
        process = self.sandbox.process.start(
            cmd="composio apps update",
        )
        self.sandbox.process.start(
            cmd=f"composio serve --host 0.0.0.0 --port {self.port}",
        )
        while requests.get(self.url, timeout=15).status_code != 200:
            time.sleep(1)
        process.wait()

    def _create_shell(self) -> Shell:
        """Create E2B shell."""
        raise NotImplementedError(
            "Creating shells for `E2B` workspaces is not allowed."
        )

    def _upload(self, action: Action) -> None:
        """Upload action instance to tooling server."""
        obj = get_runtime_action(name=action.name)
        request = requests.post(
            url=f"{self.url}/tools",
            json={
                "content": Path(str(obj.module)).read_text(encoding="utf-8"),
                "filename": Path(str(obj.module)).name,
                "dependencies": obj.requires or {},
            },
            headers={
                "x-api-key": self.api_key,
            },
            timeout=15,
        )
        response = request.json()
        if response["error"] is not None:
            raise RuntimeError(
                f"Error while uploading {action.slug}: " + response["error"]
            )
        self.logger.debug(f"Succesfully uploaded: {action.slug}")

    def execute_action(  # pylint: disable=unused-argument
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action in docker workspace."""
        if action.is_runtime:
            self._upload(action=action)

        request = requests.post(
            url=f"{self.url}/actions/execute/{action.slug}",
            json=request_data,
            headers={
                "x-api-key": self.api_key,
            },
            timeout=15,
        )
        response = request.json()
        if response["error"] is None:
            return response["data"]
        raise RuntimeError(f"Error while executing {action.slug}: " + response["error"])

    def teardown(self) -> None:
        """Teardown E2B workspace."""
        super().teardown()
        self.sandbox.close()
