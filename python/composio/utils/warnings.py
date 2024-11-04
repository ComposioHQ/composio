"""Composio version helpers."""

import os

import requests
import rich
from semver import VersionInfo


COMPOSIO_PYPI_METADATA = "https://pypi.org/pypi/composio-core/json"


def create_latest_version_warning_hook(version: str):
    def latest_version_warning() -> None:
        try:
            if (
                os.environ.get("COMPOSIO_DISABLE_VERSION_CHECK", "false").lower()
                == "true"
            ):
                return

            request = requests.get(COMPOSIO_PYPI_METADATA, timeout=10.0)
            if request.status_code != 200:
                return

            data = request.json()
            current_version = VersionInfo.parse(version)
            latest_version = VersionInfo.parse(data["info"]["version"])

            if current_version < latest_version:
                rich.print(
                    "\n[yellow]* A new version of composio is available, "
                    f"run `pip install composio-core=={latest_version}` "
                    "to update.[/yellow]"
                )
        except Exception:  # pylint: disable=broad-except
            pass

    return latest_version_warning
