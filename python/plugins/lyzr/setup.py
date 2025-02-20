"""
Setup configuration for Composio Lyzr plugin.
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_lyzr",
    version="0.7.4",
    author="Sawradip",
    author_email="sawradip@composio.dev",
    description="Use Composio to get an array of tools with your Lyzr workflow.",
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
        "lyzr-automata>=0.1.3",
        "pydantic>=2.6.4",
        "composio_core>=0.7.0,<0.8.0",
        "langchain>=0.1.0",
    ],
    include_package_data=True,
)
