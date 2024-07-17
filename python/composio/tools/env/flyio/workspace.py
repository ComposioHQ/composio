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
            github_access_token=github_access_token,
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

    def execute_action(
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
                "metadata": metadata,
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
