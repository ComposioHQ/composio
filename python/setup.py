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


setup(
    name="composio_core",
    version="0.3.25",
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
    install_requires=[
        "click",
        "aiohttp",
        "requests>=2.31.0,<3",
        "jsonschema>=4.21.1,<5",
        "beaupy>=3.7.2,<4",
        "termcolor>=2.4.0,<3",
        "pydantic>=2.6.4,<3",
        "openai>=1.3.0",
        "rich>=13.7.1,<14",
        "importlib-metadata>=4.8.1",
        "pyperclip>=1.8.2,<2",
        "jsonref>=1.1.0",
        "inflection>=0.5.1",
        "simple-parsing>=0.1.5",
        "docker>=7.1.0",
        "gymnasium>=0.29.1",
        "pyyaml>=6.0.1",
        "sentry-sdk>=2.0.0",
        "pysher==1.0.8",
        # Workspace Dependencies
        "e2b-code-interpreter",
        "fastapi",
        "gql",
        "paramiko",
        "requests_toolbelt",
        # TODO: Fix this
        "tree_sitter_languages",
        "tree_sitter==0.21.3",
        "pygments",
        "pathspec",
        "diskcache",
        "networkx",
        "ruff",
        "scipy",
        "transformers",
    ],
    include_package_data=True,
    package_data={
        "composio": scan_for_package_data(
            directory=COMPOSIO,
            package=COMPOSIO,
        ),
    },
)
