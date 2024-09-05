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


core_requires = [
    "click",
    "aiohttp",
    "requests>=2.31.0,<3",
    "jsonschema>=4.21.1,<5",
    "sentry-sdk>=2.0.0",
    "pysher==1.0.8",
    "pydantic>=2.6.4,<3",
    "rich>=13.7.1,<14",
    "importlib-metadata>=4.8.1",
    "pyperclip>=1.8.2,<2",
    "jsonref>=1.1.0",
    "inflection>=0.5.1",
    "semver>=3.0.0",
    # TODO: Extract as workspace dependencies
    "fastapi",  # Tool API
    "uvicorn",  # Tool server
    "paramiko>=3.4.1",  # Host workspace
    "docker>=7.1.0",  # Docker workspace
    "docker>=7.1.0",  # Docker workspace
    "e2b>=0.17.2a37",  # E2B Workspace
    "e2b-code-interpreter",  # E2B workspace
    "gql",  # FlyIO workspace
    "requests",  # FlyIO workspace
    "requests_toolbelt",  # FlyIO workspace
    "uvicorn",
]

tools_require = [
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

all_requirements = core_requires + tools_require

setup(
    name="composio_core",
    version="0.5.14",
    author="Utkarsh",
    author_email="utkarsh@composio.dev",
    description="Core package to act as a bridge between composio platform and other services.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/SamparkAI/composio_sdk",
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
    install_requires=core_requires,
    extras_require={
        "all": tools_require,
    },
    include_package_data=True,
    package_data={
        "composio": scan_for_package_data(
            directory=COMPOSIO,
            package=COMPOSIO,
        ),
    },
)
