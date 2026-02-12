"""
Setup configuration for Composio AG2 plugin
"""

from pathlib import Path

from setuptools import setup

setup(
    name="composio_ag2",
    version="0.11.1",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio to get an array of tools with your AG2 agent.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.10,<3.14",
    install_requires=[
        "ag2>=0.11.0",
        "composio",
    ],
    include_package_data=True,
)
