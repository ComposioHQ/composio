"""
FlyIO workspace implementation.
"""

import typing as t
from pathlib import Path
from uuid import uuid4

import requests

from composio.client.enums import Action
from composio.tools.env.base import Shell, Workspace
from composio.tools.env.flyio.client import FlyIO
from composio.tools.local.handler import get_runtime_action


class FlyIOWorkspace(Workspace):
    """FlyIO Workspace."""

    def __init__(
        self,
        image: t.Optional[str] = None,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        flyio_token: t.Optional[str] = None,
        env: t.Optional[t.Dict[str, str]] = None,
    ):
        """Initialize FlyIO workspace."""
        super().__init__(api_key=api_key, base_url=base_url)
        self.access_token = "".join(uuid4().hex.split("-"))
        self.flyio = FlyIO(
            access_token=self.access_token,
            image=image,
            api_key=api_key,
            base_url=base_url,
            flyio_token=flyio_token,
            env=env,
        )
        self.flyio.setup()
        self._update_apps()

    def _update_apps(self) -> None:
        """Update apps."""
        response = self._request(endpoint="/apps/update", method="post").json()
        if response["error"] is not None:
            raise RuntimeError(f"Error update apps: {response['error']}")
        self.logger.debug(f"Updated apps for workspace {self.id}")

    def _request(
        self,
        endpoint: str,
        method: str,
        json: t.Optional[t.Dict] = None,
        timeout: t.Optional[float] = 15.0,
    ) -> requests.Response:
        """Make request to the tooling server."""
        return requests.request(
            url=f"{self.flyio.url}{endpoint}",
            method=method,
            json=json,
            headers={
                "x-api-key": self.access_token,
            },
            timeout=timeout,
        )

    def _create_shell(self) -> Shell:
        """Create FlyIO shell."""
        raise NotImplementedError(
            "Creating shells for `FlyIO` workspaces is not allowed."
        )

    def _upload(self, action: Action) -> None:
        """Upload action instance to tooling server."""
        obj = get_runtime_action(name=action.name)
        request = self._request(
            method="post",
            endpoint="/tools",
            json={
                "content": Path(str(obj.module)).read_text(encoding="utf-8"),
                "filename": Path(str(obj.module)).name,
                "dependencies": obj.requires or {},
            },
        )
        response = request.json()
        if response["error"] is not None:
            self.logger.error(
                f"Error while uploading {action.slug}: " + response["error"]
            )
        else:
            self.logger.debug(
                f"Succesfully uploaded: {action.slug}",
            )

    def execute_action(  # pylint: disable=unused-argument
        self,
        action: Action,
        request_data: dict,
        metadata: dict,
    ) -> t.Dict:
        """Execute action in docker workspace."""
        if action.is_runtime:
            self._upload(action=action)

        request = self._request(
            method="post",
            endpoint=f"/actions/execute/{action.slug}",
            json={
                "params": request_data,
            },
        )
        response = request.json()
        if response["error"] is None:
            return response["data"]
        raise RuntimeError(f"Error while executing {action.slug}: " + response["error"])

    def teardown(self) -> None:
        """Teardown E2B workspace."""
        super().teardown()
        self.flyio.teardown()
