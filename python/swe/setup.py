"""
Setup configuration for SWE Kit.
"""

import typing as t
from pathlib import Path

from setuptools import find_packages, setup


SWEKIT = Path(__file__).parent.resolve() / "swekit"


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
    name="swekit",
    version="0.4.4",
    author="Shubhra",
    author_email="shubhra@composio.dev",
    description="Tools for running a SWE agent using Composio platform",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/composiohq/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    packages=find_packages(include=["swekit*"]),
    entry_points={
        "console_scripts": [
            "swekit=swekit.cli:swekit",
        ],
    },
    package_data={
        "swekit": scan_for_package_data(
            directory=SWEKIT,
            package=SWEKIT,
        ),
    },
    include_package_data=True,
    install_requires=[
        "pydantic>=2.7.4",
        "swebench==2.1.0",
        "datasets>=2.20.0",
        "gitpython>=3.1.43",
        "composio_core>=0.7.0,<0.8.0",
        "unidiff==0.7.5",
        "tqdm==4.66.4",
        "rich",
    ],
    extras_require={
        "langgraph": [
            "langchain-aws==0.1.17",
            "langgraph>=0.2.16",
            "langgraph-prebuilt>=0.1.0",
            "composio_langgraph>=0.5.0,<0.8.0",
            "python-dotenv==1.0.1",
        ]
    },
)
