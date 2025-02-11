"""
Setup configuration for Composio Ag2 plugin.
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_ag2",
    version="0.7.2",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio to get an array of tools with your Ag2 Plugin.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    install_requires=[
        "composio_autogen>=0.7.0",
        "composio_core>=0.7.0,<0.8.0",
        "ag2>=0.7.3",
    ],
    include_package_data=True,
)
