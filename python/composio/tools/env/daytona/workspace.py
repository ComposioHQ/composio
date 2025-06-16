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
        Resources,
        CreateSandboxFromImageParams,
        Sandbox,
    )

    DAYTONA_INSTALLED = True
except ImportError:
    Sandbox = t.Any
    DAYTONA_INSTALLED = False


@dataclass
class Config(WorkspaceConfigType):
    """Daytona workspace configuration."""

    api_key: t.Optional[str] = None
    """Daytona API Key."""

    target: t.Optional[str] = None
    """Target region for the Daytona Sandbox. Defaults to "us"."""

    language: t.Optional[CodeLanguage] = None
    """Programming language for the Daytona Sandbox. Defaults to "python"."""

    image: t.Optional[str] = None
    """Custom Docker image to use for the Daytona Sandbox."""

    env_vars: t.Optional[t.Dict[str, str]] = None
    """Environment variables to set in the Daytona Sandbox."""

    labels: t.Optional[t.Dict[str, str]] = None
    """Custom labels for the Daytona Sandbox."""

    public: t.Optional[bool] = None
    """Whether the Daytona Sandbox should be public. Defaults to False."""

    resources: t.Optional[Resources] = None
    """Resource configuration for the Daytona Sandbox."""

    auto_stop_interval: t.Optional[int] = None
    """Interval in minutes after which the Daytona Sandbox will automatically stop if no event occurs during that time. Default is 15 minutes. 0 means no auto-stop."""

    auto_archive_interval: t.Optional[int] = None
    """Interval in minutes after which a continuously stopped Sandbox will automatically archive. Default is 7 days. 0 means the maximum interval will be used."""


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
                server_url="https://app.daytona.io/api",
                target=config.target,
            )
        )

        image = config.image
        if image is None:
            image = "composio/composio:dev"

        self.language = config.language
        self.image = image
        self.resources = config.resources
        self.env_vars = config.env_vars
        self.labels = config.labels
        self.public = config.public
        self.auto_stop_interval = config.auto_stop_interval
        self.auto_archive_interval = config.auto_archive_interval

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

        params = CreateSandboxFromImageParams(
            image=self.image,
            resources=self.resources,
            language=self.language,
            env_vars=self.env_vars,
            labels=self.labels,
            public=self.public,
            auto_stop_interval=self.auto_stop_interval,
            auto_archive_interval=self.auto_archive_interval,
        )

        self.sandbox = self.daytona.create(params)

        self.url = self.url = f"{self.sandbox.get_preview_link(8000).url}/api"
        self.host = self.sandbox.get_preview_link(80).url
        self.ports = []
        self._wait()

    def teardown(self) -> None:
        """Teardown Daytona workspace."""

        super().teardown()
        self.sandbox.delete()
