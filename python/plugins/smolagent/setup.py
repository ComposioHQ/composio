"""
Setup configuration for Composio Smol Agents plugin
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_smol",
    version="0.7.1",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio to get array of strongly typed tools for Smol Agents",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    install_requires=[
        "composio_core>=0.7.0,<0.8.0",
        "smolagents",
    ],
    include_package_data=True,
)
