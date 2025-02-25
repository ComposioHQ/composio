"""
Setup configuration for Composio Claude plugin.
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_claude",
    version="0.7.4",
    author="Sawradip",
    author_email="sawradip@composio.dev",
    description="Use Composio to get an array of tools with your Claude LLMs.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    install_requires=["composio_openai>=0.5.0,<0.8.0", "anthropic>=0.25.7"],
    include_package_data=True,
)
