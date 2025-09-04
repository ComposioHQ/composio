"""
Setup configuration for Composio LangGraph plugin
"""

from pathlib import Path

from setuptools import setup

setup(
    name="composio_llamaindex",
    version="0.8.9",
    author="composio",
    author_email="tech@composio.dev",
    description="Use Composio to get array of tools with LlamaIndex Agent Workflows",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    install_requires=["llama-index"],
    include_package_data=True,
)
