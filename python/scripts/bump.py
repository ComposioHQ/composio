"""
Script for bumping the frameworks and plugins.

Usage:
    python scripts/bump.py --major/--minor/--patch/--pre/--post
"""

import re
import sys
from enum import Enum
from pathlib import Path

from semver import VersionInfo


class BumpType(Enum):
    """Bump type."""

    MAJOR = "major"
    MINOR = "minor"
    PATCH = "patch"
    PRE = "pre"
    POST = "post"


TO_REPLACE = (
    'version="',
    "composio_core===",
    "composio_langchain===",
    "composio_crewai===",
    "composio_autogen===",
    "composio_lyzr===",
    "composio_openai===",
    "composio_claude===",
    "composio_griptape===",
)


def _bump(file: Path, bump_type: BumpType) -> None:
    """Bump versions in a file."""
    print("=" * 64)
    print(f"Bumping {file}")
    content = file.read_text(encoding="utf-8")
    (version_str,) = re.findall(pattern='version="(.*)",', string=content)
    version = VersionInfo.parse(version=version_str)

    print(f"Current version {version}")
    if bump_type == BumpType.MAJOR:
        update = version.bump_major()
    elif bump_type == BumpType.MINOR:
        update = version.bump_minor()
    elif bump_type == BumpType.PATCH:
        update = version.bump_patch()
    elif bump_type == BumpType.PRE:
        update = version.bump_prerelease()
    else:
        update = version.bump_build(token="post")

    print(f"Next version {update}")
    for to_replace in TO_REPLACE:
        content = content.replace(
            f"{to_replace}{version}",
            f"{to_replace}{update}",
        )

    file.write_text(content, encoding="utf-8")
    print(f"Bumped {file} to {update}")


def bump(bump_type: BumpType) -> None:
    """Bump framework and plugins."""

    cwd = Path.cwd()
    for setup in (cwd / "setup.py", *(cwd / "plugins").glob("**/setup.py")):
        _bump(file=setup, bump_type=bump_type)


if __name__ == "__main__":
    bump(
        bump_type=BumpType(sys.argv[1].replace("--", "")),
    )
