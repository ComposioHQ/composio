"""
Setup configuration for SWE Kit.
"""

from pathlib import Path

from setuptools import find_packages, setup


setup(
    name="swekit",
    version="0.1.0-rc1",
    author="Shubhra",
    author_email="shubhra@composio.dev",
    description="Tools for running a SWE agent using Composio platform",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/SamparkAI/composio_sdk",
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
        "swekit": [
            "py.typed",
            "scaffold/templates/crewai/*",
        ],
    },
    include_package_data=True,
    install_requires=[
        "pydantic>=2.7.4",
        "swebench==1.1.0",
        "datasets>=2.20.0",
        "gitpython>=3.1.43",
        "composio_core>=0.3.9",
        "unidiff==0.7.5",
        "tqdm==4.66.4",
        "rich",
    ],
)
