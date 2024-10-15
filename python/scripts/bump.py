"""
Script for bumping the frameworks and plugins.

Usage:
    python scripts/bump.py --major/--minor/--patch/--pre/--post
"""

import re
import sys
import logging
from enum import Enum
from pathlib import Path
from semver import VersionInfo
from typing import Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(message)s')

class BumpType(Enum):
    MAJOR = "major"
    MINOR = "minor"
    PATCH = "patch"
    PRE = "pre"
    POST = "post"

def _get_bumped_version(current: VersionInfo, btype: BumpType) -> VersionInfo:
    bump_methods = {
        BumpType.MAJOR: current.bump_major,
        BumpType.MINOR: current.bump_minor,
        BumpType.PATCH: current.bump_patch,
        BumpType.PRE: current.bump_prerelease,
        BumpType.POST: lambda: current.bump_build(token="post")
    }
    return bump_methods[btype]()

def _bump_setup(file: Path, bump_type: BumpType) -> None:
    logging.info("=" * 64)
    logging.info(f"Bumping {file}")
    try:
        content = file.read_text(encoding="utf-8")
        version_str = re.search(r'version="(.*?)"', content).group(1)
        version = VersionInfo.parse(version=version_str)
        logging.info(f"Current version {version}")
        update = _get_bumped_version(current=version, btype=bump_type)
        logging.info(f"Next version {update}")
        content = content.replace(f'version="{version}"', f'version="{update}"')
        logging.info("Bumping dependencies")
        for chunk in content.split('"'):
            if not chunk.startswith("composio") or ">" not in chunk:
                continue
            dependency, version_range = chunk.split(">")
            min_version, max_version = map(
                VersionInfo.parse,
                version_range.replace("=", "").replace(">", "").replace("<", "").split(","),
            )
            min_version._patch = max_version.patch - (max_version.patch % 10)
            content = content.replace(
                chunk,
                f"{dependency}>={min_version},<={_get_bumped_version(current=max_version, btype=bump_type)}",
            )
        file.write_text(content, encoding="utf-8")
        logging.info(f"Bumped {file} to {update}")
    except Exception as e:
        logging.error(f"Failed to bump {file}: {e}")

def _bump_setups(bump_type: BumpType) -> None:
    cwd = Path.cwd()
    for setup in (
        cwd / "setup.py",
        cwd / "swe" / "setup.py",
        *(cwd / "plugins").glob("**/setup.py"),
    ):
        _bump_setup(file=setup, bump_type=bump_type)

def _bump_dockerfile(file: Path, bump_type: BumpType) -> None:
    logging.info("=" * 64)
    logging.info(f"Bumping {file}")
    try:
        content = file.read_text(encoding="utf-8")
        version_str = re.search(r"composio-core\[all\]==(\d+\.\d+\.\d+)", content).group(1)
        version = VersionInfo.parse(version=version_str)
        logging.info(f"Current version {version}")
        update = _get_bumped_version(current=version, btype=bump_type)
        logging.info(f"Next version {update}")
        content = content.replace(
            f"composio-core[all]=={version}",
            f"composio-core[all]=={update}",
        )
        file.write_text(content, encoding="utf-8")
        logging.info(f"Bumped {file} to {update}")
    except Exception as e:
        logging.error(f"Failed to bump {file}: {e}")

def _bump_dockerfiles(bump_type: BumpType) -> None:
    cwd = Path.cwd()
    for setup in (cwd / "dockerfiles").glob("**/Dockerfile*"):
        _bump_dockerfile(file=setup, bump_type=bump_type)

def _bump_init(bump_type: BumpType) -> None:
    file = Path.cwd() / "composio" / "__init__.py"
    logging.info("=" * 64)
    logging.info(f"Bumping {file}")
    try:
        content = file.read_text(encoding="utf-8")
        version_str = re.search(r'__version__ = "(.*?)"', content).group(1)
        version = VersionInfo.parse(version=version_str)
        logging.info(f"Current version {version}")
        update = _get_bumped_version(current=version, btype=bump_type)
        logging.info(f"Next version {update}")
        content = content.replace(f'__version__ = "{version}"', f'__version__ = "{update}"')
        file.write_text(content, encoding="utf-8")
        logging.info(f"Bumped {file} to {update}")
    except Exception as e:
        logging.error(f"Failed to bump {file}: {e}")

def bump(bump_type: BumpType) -> None:
    for _bump in (_bump_setups, _bump_dockerfiles, _bump_init):
        _bump(bump_type=bump_type)

if __name__ == "__main__":
    try:
        bump_type = BumpType(sys.argv[1].replace("--", ""))
        bump(bump_type=bump_type)
    except (IndexError, ValueError) as e:
        logging.error("Invalid or missing bump type argument. Please use --major, --minor, --patch, --pre, or --post.")
