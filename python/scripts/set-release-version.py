#!/usr/bin/env python3
"""Set one exact version across the complete Python SDK release family."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

VERSION_PATTERN = re.compile(
    r"^(?:[1-9]\d*!)?(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){1,3}"
    r"(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?"
    r"(?:\+[a-z0-9]+(?:[._-][a-z0-9]+)*)?$"
)
PROJECT_NAME_PATTERN = re.compile(r'(?m)^name = "([^"]+)"$')
PROJECT_VERSION_PATTERN = re.compile(r'(?m)^version = "([^"]+)"$')
SETUP_NAME_PATTERN = re.compile(r'(?m)^\s*name="([^"]+)",\s*$')
SETUP_VERSION_PATTERN = re.compile(r'(?m)^\s*version="([^"]+)",\s*$')
RUNTIME_VERSION_PATTERN = re.compile(r'(?m)^__version__ = "([^"]+)"$')


@dataclass(frozen=True)
class MetadataFile:
    path: Path
    pattern: re.Pattern[str]
    current_version: str


@dataclass(frozen=True)
class ReleasePackage:
    name: str
    metadata: tuple[MetadataFile, ...]


def _single_match(path: Path, pattern: re.Pattern[str], label: str) -> str:
    if not path.is_file():
        raise ValueError(f"Missing {label}: {path}")
    matches = pattern.findall(path.read_text(encoding="utf-8"))
    if len(matches) != 1:
        raise ValueError(
            f"Expected exactly one {label} in {path}, found {len(matches)}"
        )
    return matches[0]


def _project(path: Path) -> tuple[str, str]:
    return (
        _single_match(path, PROJECT_NAME_PATTERN, "project name"),
        _single_match(path, PROJECT_VERSION_PATTERN, "project version"),
    )


def _normalize_distribution_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def enumerate_release_family(python_root: Path) -> list[ReleasePackage]:
    core_pyproject = python_root / "pyproject.toml"
    runtime_path = python_root / "composio" / "__version__.py"
    core_name, core_version = _project(core_pyproject)
    if core_name != "composio":
        raise ValueError(f"Expected core project name composio, found {core_name}")
    runtime_version = _single_match(
        runtime_path, RUNTIME_VERSION_PATTERN, "runtime version"
    )
    if runtime_version != core_version:
        raise ValueError(
            f"Existing runtime version {runtime_version} does not match core {core_version}"
        )

    packages = [
        ReleasePackage(
            name=core_name,
            metadata=(
                MetadataFile(core_pyproject, PROJECT_VERSION_PATTERN, core_version),
                MetadataFile(runtime_path, RUNTIME_VERSION_PATTERN, runtime_version),
            ),
        )
    ]
    providers_root = python_root / "providers"
    if not providers_root.is_dir():
        raise ValueError(f"Missing providers directory: {providers_root}")

    for provider_dir in sorted(
        entry for entry in providers_root.iterdir() if entry.is_dir()
    ):
        pyproject_path = provider_dir / "pyproject.toml"
        setup_path = provider_dir / "setup.py"
        project_name, project_version = _project(pyproject_path)
        setup_name = _single_match(setup_path, SETUP_NAME_PATTERN, "setup name")
        setup_version = _single_match(
            setup_path, SETUP_VERSION_PATTERN, "setup version"
        )
        expected_name = f"composio-{provider_dir.name.replace('_', '-')}"
        if project_name != expected_name:
            raise ValueError(
                f"Provider directory {provider_dir.name} must declare {expected_name}, "
                f"found {project_name}"
            )
        if _normalize_distribution_name(setup_name) != project_name:
            raise ValueError(
                f"{setup_path} declares {setup_name}, expected {project_name}"
            )
        if setup_version != project_version:
            raise ValueError(
                f"{setup_path} version {setup_version} does not match "
                f"{pyproject_path} version {project_version}"
            )
        packages.append(
            ReleasePackage(
                name=project_name,
                metadata=(
                    MetadataFile(
                        pyproject_path, PROJECT_VERSION_PATTERN, project_version
                    ),
                    MetadataFile(setup_path, SETUP_VERSION_PATTERN, setup_version),
                ),
            )
        )

    existing_versions = {
        metadata.current_version
        for package in packages
        for metadata in package.metadata
    }
    if len(existing_versions) != 1:
        raise ValueError(
            "Existing Python release-family versions do not match: "
            + ", ".join(sorted(existing_versions))
        )
    return packages


def set_release_version(python_root: Path, version: str) -> list[ReleasePackage]:
    if not VERSION_PATTERN.fullmatch(version):
        raise ValueError(f"Invalid exact PEP 440 version: {version}")
    packages = enumerate_release_family(python_root)
    replacements: dict[Path, str] = {}
    for package in packages:
        for metadata in package.metadata:
            source = metadata.path.read_text(encoding="utf-8")
            updated, count = metadata.pattern.subn(
                lambda match: match.group(0).replace(
                    metadata.current_version, version, 1
                ),
                source,
            )
            if count != 1:
                raise ValueError(
                    f"Expected one version replacement in {metadata.path}, found {count}"
                )
            replacements[metadata.path] = updated

    for path, contents in replacements.items():
        if path.read_text(encoding="utf-8") != contents:
            path.write_text(contents, encoding="utf-8")
    return packages


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--python-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    try:
        packages = set_release_version(args.python_root.resolve(), args.version)
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "packages": [
                    {"name": package.name, "version": args.version}
                    for package in packages
                ]
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
