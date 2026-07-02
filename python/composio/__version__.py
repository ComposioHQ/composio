from __future__ import annotations

import re
from importlib.metadata import version
from pathlib import Path


def _read_source_version() -> str | None:
    pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
    if not pyproject.exists():
        return None

    match = re.search(r'^version\s*=\s*"([^"]+)"', pyproject.read_text(), re.MULTILINE)
    if match is None:
        raise RuntimeError(f"Could not read project version from {pyproject}")
    return match.group(1)


__version__ = _read_source_version() or version("composio")
