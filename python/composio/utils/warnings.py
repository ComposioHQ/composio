"""Composio version helpers."""

import requests
import rich
from semver import VersionInfo


def create_latest_version_warning_hook(version: str):
    def latest_version_warning() -> None:
        try:
            request = requests.get(
                "https://pypi.org/pypi/composio-core/json",
                timeout=10.0,
            )
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
