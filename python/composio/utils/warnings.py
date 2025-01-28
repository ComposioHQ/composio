"""Composio version helpers."""

import os
import threading

import requests
import rich
from semver import VersionInfo


COMPOSIO_PYPI_METADATA = "https://pypi.org/pypi/composio-core/json"

_latest_version = None


def _fetch_latest_version():
    global _latest_version
    try:
        request = requests.get(COMPOSIO_PYPI_METADATA, timeout=10.0)
        if request.status_code != 200:
            return

        data = request.json()
        _latest_version = data["info"]["version"]
    except Exception:  # pylint: disable=broad-except
        pass


def create_latest_version_warning_hook(version: str):
    if os.environ.get("COMPOSIO_DISABLE_VERSION_CHECK", "false").lower() != "false":
        return lambda: None

    version_thread = threading.Thread(target=_fetch_latest_version, daemon=True)
    version_thread.start()

    def latest_version_warning() -> None:
        try:
            version_thread.join(timeout=0.1)
            if _latest_version is None:
                return

            current_version = VersionInfo.parse(version)
            latest_version = VersionInfo.parse(_latest_version)

            # TODO: Change this to `major` after
            if current_version.minor < latest_version.minor:
                rich.print(
                    "\n[yellow]* A new major version of composio is available, "
                    f"run `pip install composio-core=={latest_version}` "
                    "to update.[/yellow]"
                )
        except Exception:  # pylint: disable=broad-except
            pass

    return latest_version_warning
