"""
Setup configuration for Composio LangGraph plugin
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_langgraph",
    version="0.3.20",
    author="Sawradip",
    author_email="sawradip@composio.dev",
    description="Use Composio to get array of tools with LnagGraph Agent Workflows",
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
        "langchain_core>=0.2.17",
        "composio_langchain==0.3.20",
    ],
    include_package_data=True,
)
