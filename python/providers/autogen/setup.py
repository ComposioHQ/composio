"""
Setup configuration for Composio Gemin plugin
"""

from pathlib import Path

from setuptools import setup

setup(
    name="composio_autogen",
    version="0.17.1",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio to get an array of tools with your Autogen agent.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.10,<4",
    install_requires=[
        "pyautogen>=0.2.19,<0.11",
        "flaml==2.6.0",
        "autogen_core>=0.7.5",
        "composio",
    ],
    include_package_data=True,
)
