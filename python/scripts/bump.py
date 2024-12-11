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
    MAJOR = "major"
    MINOR = "minor"
    PATCH = "patch"
    PRE = "pre"
    POST = "post"


def _get_bumped_version(current: VersionInfo, btype: BumpType) -> VersionInfo:
    if btype == BumpType.MAJOR:
        return current.next_version("major")

    if btype == BumpType.MINOR:
        return current.next_version("minor")

    if btype == BumpType.PATCH:
        return current.next_version("patch")

    if btype == BumpType.PRE:
        return current.next_version("prerelease")

    return current.bump_build(token="post")


def _bump_setup(file: Path, bump_type: BumpType) -> None:
    print("=" * 64)
    print(f"Bumping {file}")
    content = file.read_text(encoding="utf-8")
    (version_str,) = re.findall(pattern='version="(.*)",', string=content)
    version = VersionInfo.parse(version=version_str)
    print(f"Current version {version}")
    update = _get_bumped_version(current=version, btype=bump_type)
    print(f"Next version {update}")
    content = content.replace(f'version="{version}"', f'version="{update}"')
    print("Bumping dependencies")
    for chunk in content.split('"'):
        if not chunk.startswith("composio") or ">" not in chunk:
            continue
        dependency, version_range = chunk.split(">")
        min_version, max_version = map(
            VersionInfo.parse,
            version_range.replace("=", "").replace(">", "").replace("<", "").split(","),
        )
        min_version._patch = max_version.patch - (  # pylint: disable=protected-access
            max_version.patch % 10
        )
        content = content.replace(
            chunk,
            f"{dependency}>={min_version},<={_get_bumped_version(current=max_version, btype=bump_type)}",
        )
    file.write_text(content, encoding="utf-8")
    print(f"Bumped {file} to {update}")


def _bump_setups(bump_type: BumpType) -> None:
    cwd = Path.cwd()
    for setup in (
        cwd / "setup.py",
        cwd / "swe" / "setup.py",
        *(cwd / "plugins").glob("**/setup.py"),
    ):
        _bump_setup(file=setup, bump_type=bump_type)


def _bump_dockerfile(file: Path, bump_type: BumpType) -> None:
    print("=" * 64)
    print(f"Bumping {file}")
    content = file.read_text(encoding="utf-8")
    try:
        (version_str,) = re.findall(
            pattern=r"composio-core\[all\]==(\d+.\d+.\d+) ", string=content
        )
    except ValueError as error:
        print(f"{error=}")
        return
    version = VersionInfo.parse(version=version_str)
    print(f"Current version {version}")
    update = _get_bumped_version(current=version, btype=bump_type)
    print(f"Next version {update}")
    content = content.replace(
        f"composio-core[all]=={version}",
        f"composio-core[all]=={update}",
    )

    file.write_text(content, encoding="utf-8")
    print(f"Bumped {file} to {update}")


def _bump_dockerfiles(bump_type: BumpType) -> None:
    cwd = Path.cwd()
    for setup in (cwd / "dockerfiles").glob("**/Dockerfile*"):
        _bump_dockerfile(file=setup, bump_type=bump_type)


def _bump_init(bump_type: BumpType) -> None:
    file = Path.cwd() / "composio" / "__version__.py"
    print("=" * 64)
    print(f"Bumping {file}")
    content = file.read_text(encoding="utf-8")
    (version_str,) = re.findall(pattern='__version__ = "(.*)"', string=content)
    version = VersionInfo.parse(version=version_str)
    print(f"Current version {version}")
    update = _get_bumped_version(current=version, btype=bump_type)
    print(f"Next version {update}")
    content = content.replace(f'__version__ = "{version}"', f'__version__ = "{update}"')
    file.write_text(content, encoding="utf-8")
    print(f"Bumped {file} to {update}")


def bump(bump_type: BumpType) -> None:
    for _bump in (_bump_setups, _bump_dockerfiles, _bump_init):
        _bump(bump_type=bump_type)


if __name__ == "__main__":
    bump(
        bump_type=BumpType(sys.argv[1].replace("--", "")),
    )
