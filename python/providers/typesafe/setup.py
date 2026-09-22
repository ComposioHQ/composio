"""
Setup configuration for Composio TypeSafe plugin.
"""

from pathlib import Path

from setuptools import setup

setup(
    name="composio_typesafe",
    version="0.23.0",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio tools with TypeSafe's Jev model: a tool call, a partial call, or an abstention, each with a confidence score.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.10,<4",
    install_requires=["typesafe-sdk>=0.6.0,<0.7.0", "composio"],
    include_package_data=True,
)
