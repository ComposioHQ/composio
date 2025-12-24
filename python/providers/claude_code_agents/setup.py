"""
Setup configuration for Composio Claude Code Agents plugin
"""

from pathlib import Path

from setuptools import find_packages, setup

setup(
    name="composio_claude_code_agents",
    version="0.10.3",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio to get array of tools for Claude Code Agents SDK",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.10,<4",
    packages=find_packages(),
    install_requires=["claude-agent-sdk>=0.1.0", "composio"],
    include_package_data=True,
)
