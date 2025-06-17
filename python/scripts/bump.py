import readline
import typing as t
from enum import Enum
from itertools import chain
from pathlib import Path

import click
import tomli
from semver import VersionInfo

CWD = Path.cwd()
SKIPDIR = (".venv",)
PYPROJECT = "pyproject.toml"
SETUP = "setup.py"

BumpTypes = {
    "M": "major",
    "m": "minor",
    "p": "patch",
    "c": "pre",
    "b": "post",
    "s": "skip",
}
BumpTypesPrompt = " | ".join([f"{k}-{v.title()}" for k, v in BumpTypes.items()])


class BumpType(Enum):
    MAJOR = "major"
    MINOR = "minor"
    PATCH = "patch"
    PRE = "pre"
    POST = "post"


def _get_bumped_version(current: VersionInfo, bump_type: BumpType) -> VersionInfo:
    if bump_type == BumpType.MAJOR:
        return current.next_version("major")

    if bump_type == BumpType.MINOR:
        return current.next_version("minor")

    if bump_type == BumpType.PATCH:
        return current.next_version("patch")

    if bump_type == BumpType.PRE:
        return current.next_version("prerelease")

    return current.bump_build(token="post")


def _skip(file: Path) -> bool:
    return any(skipdir in file.parts for skipdir in SKIPDIR)


def _find_packages():
    files = []
    for file in chain(CWD.glob(f"**/{PYPROJECT}"), CWD.glob(f"**/{SETUP}")):
        if _skip(file=file):
            continue
        files.append(file)
    return files


def _get_version_update(package: str, version: str) -> t.Optional[str]:
    pre = None
    if "rc" in version:
        version, marker, number = version.partition("rc")
        pre = f"{marker}{number}"

    # TODO: Add support for post builds
    current_version = VersionInfo.parse(version=version)
    current_version._prerelease = pre

    bump_type_input = click.prompt(f"* Bump {package}@{version} -> {BumpTypesPrompt}")
    if bump_type_input == "s":
        return None

    try:
        bump_type = BumpType(BumpTypes[bump_type_input])
    except (ValueError, KeyError) as e:
        raise click.ClickException(f"Invalid bump type: {e}")
    return str(_get_bumped_version(current=current_version, bump_type=bump_type))


def _bump_setup_py(file: Path):
    # Load config
    content = file.read_text(encoding="utf-8")
    _, _, arguments = content.partition("setup(")

    package, version = None, None
    for line in arguments.split("\n"):
        if "=" not in line:
            continue

        arg, val = line.strip().split("=", maxsplit=1)
        val = val.replace('"', "").replace(",", "").strip()
        if arg == "name":
            package = val

        if arg == "version":
            version = val

    # Skip the main setup.py
    if package == "composio":
        return

    if package is None or version is None:
        raise ValueError(f"Package or version not found in {file}")

    # Bump version
    next_version = _get_version_update(package=package, version=version)
    if next_version is None:
        click.echo(f"* Skipping {package}")
        return

    click.echo(f"* Bumping {package} -> {next_version}")
    content = content.replace(f'version="{version}"', f'version="{next_version}"')
    file.write_text(content, encoding="utf-8")


def _bump_pyproject_toml(file: Path):
    # Load config
    content = file.read_text(encoding="utf-8")
    config = tomli.loads(content)
    project = t.cast(dict, config["project"])

    # Extract meta
    package = project["name"]
    version = project["version"]

    # Bump version
    next_version = _get_version_update(package=package, version=version)
    if next_version is None:
        click.echo(f"* Skipping {package}")
        return

    click.echo(f"* Bumping {package} -> {next_version}")
    content = content.replace(f'version = "{version}"', f'version = "{next_version}"')
    file.write_text(content, encoding="utf-8")


def _bump_package(file: Path):
    if file.name == PYPROJECT:
        return _bump_pyproject_toml(file=file)
    return _bump_setup_py(file=file)


@click.command("bump")
def bump():
    packages = _find_packages()
    for package in packages:
        _bump_package(file=package)


if __name__ == "__main__":
    bump()
