"""
Setup configuration for compsio core.
"""

import typing as t
from pathlib import Path

from setuptools import find_packages, setup

COMPOSIO = Path(__file__).parent.resolve() / "composio"


def scan_for_package_data(
    directory: Path,
    package: Path,
    data: t.Optional[t.List[str]] = None,
) -> t.List[str]:
    """Walk the package and scan for package files."""
    data = data or []
    for child in directory.iterdir():
        if child.name.endswith(".py") or child.name.endswith(".pyc"):
            continue

        if child.is_file():
            data.append(str(child.relative_to(package)))
            continue

        data += scan_for_package_data(
            directory=child,
            package=package,
        )
    return data


core_requirements = [
    "aiohttp",
    "requests>=2.31.0,<3",
    "jsonschema>=4.21.1,<5",
    "sentry-sdk>=2.0.0",
    "pysher==1.0.8",
    "pydantic>=2.6.4,<2.10",
    "importlib-metadata>=4.8.1",
    "jsonref>=1.1.0",
    "inflection>=0.5.1",
    "semver>=2.13.0",
    # CLI dependencies
    "click",
    "rich>=13.7.1,<14",
    "pyperclip>=1.8.2,<2",
    # Workspace dependencies
    "paramiko>=3.4.1",  # Host workspace
    # Tooling server dependencies
    "fastapi",
    "uvicorn",
]

e2b_workspace_requirements = [
    "e2b>=0.17.2a37,<1",  # E2B Workspace
    "e2b-code-interpreter",  # E2B workspace
]

docker_workspace_requirements = [
    "docker>=7.1.0",  # Docker workspace
]

flyio_workspace_requirements = [
    "gql",  # FlyIO workspace
    "requests_toolbelt",  # FlyIO workspace
]

tools_requirements = [
    "tree_sitter_languages",
    "tree_sitter==0.21.3",
    "pygments",
    "pathspec",
    "diskcache",
    "networkx",
    "ruff",
    "flake8",
    "transformers",
]

all_requirements = (
    core_requirements
    + e2b_workspace_requirements
    + docker_workspace_requirements
    + flyio_workspace_requirements
    + tools_requirements
)

setup(
    name="composio_core",
    version="0.5.44",
    author="Utkarsh",
    author_email="utkarsh@composio.dev",
    description="Core package to act as a bridge between composio platform and other services.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/composiohq/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    packages=find_packages(include=["composio*"]),
    entry_points={
        "console_scripts": [
            "composio=composio.cli:composio",
        ],
    },
    install_requires=core_requirements,
    extras_require={
        "all": all_requirements,
        "tools": tools_requirements,
        "e2b": e2b_workspace_requirements,
        "flyio": flyio_workspace_requirements,
        "docker": docker_workspace_requirements,
    },
    include_package_data=True,
    package_data={
        "composio": scan_for_package_data(
            directory=COMPOSIO,
            package=COMPOSIO,
        ),
    },
)
