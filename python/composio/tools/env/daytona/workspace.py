"""Daytona Workspace."""

from __future__ import annotations

import os
import time
import typing as t
from dataclasses import dataclass

from composio.exceptions import ComposioSDKError
from composio.tools.env.base import RemoteWorkspace, WorkspaceConfigType


try:
    import requests
    from daytona import (
        Daytona,
        DaytonaConfig,
        CodeLanguage,
        CreateSandboxFromSnapshotParams,
        SessionExecuteRequest,
    )

    DAYTONA_INSTALLED = True
except ImportError:
    Sandbox = t.Any
    DAYTONA_INSTALLED = False

DEFAULT_DAYTONA_SNAPSHOT= "daytona-composio"

@dataclass
class Config(WorkspaceConfigType):
    """Daytona workspace configuration."""

    api_key: t.Optional[str] = None
    """Daytona API Key."""

    api_url: t.Optional[str] = "https://app.daytona.io/api"
    """Daytona API URL."""

    target: t.Optional[str] = "us"
    """Target region for the Daytona Sandbox. Defaults to "us"."""

    language: t.Optional[CodeLanguage] = None
    """Programming language for the Daytona Sandbox. Defaults to "python"."""

    os_user: t.Optional[str] = None
    """OS user for the Daytona Sandbox."""

    snapshot: t.Optional[str] = None
    """Name of the snapshot to use for the Daytona sandbox. Defaults to "daytona-composio"."""

    env_vars: t.Optional[t.Dict[str, str]] = None
    """Environment variables to set in the Daytona Sandbox."""

    labels: t.Optional[t.Dict[str, str]] = None
    """Custom labels for the Daytona Sandbox."""

    public: t.Optional[bool] = None
    """Whether the Daytona Sandbox should be public. Defaults to False."""

    timeout: t.Optional[float] = 60
    """Timeout in seconds for Sandbox to be created and started."""

    auto_stop_interval: t.Optional[int] = None
    """Interval in minutes after which the Daytona Sandbox will automatically stop if no event occurs during that time. Default is 15 minutes. 0 means no auto-stop."""

    auto_archive_interval: t.Optional[int] = None
    """Interval in minutes after which a continuously stopped Sandbox will automatically archive. Default is 7 days. 0 means the maximum interval will be used."""

    auto_delete_interval: t.Optional[int] = None
    """Interval in minutes after which a continuously stopped Sandbox will automatically be deleted. By default, auto-delete is disabled.
    Negative value means disabled, 0 means delete immediately upon stopping."""


class DaytonaWorkspace(RemoteWorkspace):
    """Create and manage Daytona workspace."""

    def __init__(self, config: Config):
        """Initialize Daytona workspace."""
        if not DAYTONA_INSTALLED:
            raise ComposioSDKError(
                "`daytona` is required to use daytona workspace, "
                "run `pip3 install composio-core[daytona]` or "
                "`pip3 install daytona` to install",
            )

        super().__init__(config=config)

        self.daytona = Daytona(
            config=DaytonaConfig(
                api_key=config.api_key,
                api_url=config.api_url,
                target=config.target,
            )
        )

        snapshot = config.snapshot
        if snapshot is None:
            # Use the default snapshot
            snapshot = DEFAULT_DAYTONA_SNAPSHOT

        self.language = config.language
        self.snapshot = snapshot
        self.env_vars = config.env_vars
        self.labels = config.labels
        self.public = config.public
        self.auto_stop_interval = config.auto_stop_interval
        self.auto_archive_interval = config.auto_archive_interval
        self.auto_delete_interval = config.auto_delete_interval
        self.timeout = config.timeout
        self.os_user = config.os_user
        self.daytona_preview_token = None

    def _request(
        self,
        endpoint: str,
        method: str,
        json: t.Optional[t.Dict] = None,
        timeout: t.Optional[float] = 300.0,
        log: bool = True,
    ) -> requests.Response:
        """Make request to the tooling server."""
        headers = {
            "x-api-key": self.access_token,
        }

        # Add Daytona preview token if available
        if self.daytona_preview_token:
            headers["x-daytona-preview-token"] = self.daytona_preview_token

        response = requests.request(
            url=f"{self.url}{endpoint}",
            method=method,
            json=json,
            headers=headers,
            timeout=timeout,
        )
        if log:
            self.logger.debug(
                f"Making HTTP request on {self.id}\n"
                f"Request: {method.upper()} {endpoint} @ {self.url}\n"
                f"Response: {response.status_code} -> {response.text}"
            )
        if response.status_code in (500, 503):
            raise ComposioSDKError(
                message=(
                    f"Error requesting data from {self}, "
                    f"Request: {method.upper()} {endpoint} @ {self.url}\n"
                    f"Response: {response.status_code} -> {response.text}"
                ),
            )
        return response

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
        """Setup workspace."""

        params = CreateSandboxFromSnapshotParams(
            snapshot=self.snapshot,
            language=self.language,
            env_vars=self.env_vars,
            labels=self.labels,
            public=self.public,
            auto_stop_interval=self.auto_stop_interval,
            auto_archive_interval=self.auto_archive_interval,
            auto_delete_interval=self.auto_delete_interval,
            os_user=self.os_user,
        )

        self.sandbox = self.daytona.create(params, timeout=self.timeout)

        # Get preview link and extract token
        preview_link = self.sandbox.get_preview_link(8000)
        self.url = f"{preview_link.url}/api"
        self.daytona_preview_token = preview_link.token
        self.logger.debug(f"{self}.url = {self.url}")
        self.logger.debug(f"{self}.daytona_preview_token = {self.daytona_preview_token}")

        # Set host for public access (port 80)
        self.host = self.sandbox.get_preview_link(80).url
        self.ports = []

        # Start app update in background
        self.sandbox.process.exec(
            command="composio apps generate-types",
            env=self.environment,
        )

        exec_session_id = "composio-update-serve"
        self.sandbox.process.create_session(exec_session_id)
        self.sandbox.process.execute_session_command(exec_session_id, SessionExecuteRequest(
            command="composio serve -h '0.0.0.0' -p 8000",
            runAsync=True
        ))

        self._wait()

    def teardown(self) -> None:
        """Teardown Daytona workspace."""

        super().teardown()
        if hasattr(self, "sandbox"):
            try:
                self.sandbox.delete()
            except Exception as e:
                self.logger.debug(f"Error deleting Daytona sandbox: {e}")
