"""
Setup configuration for Composio LiteLLM plugin.
"""

from pathlib import Path

from setuptools import setup

setup(
    name="composio_litellm",
    version="0.11.5",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio to get an array of tools with LiteLLM AI gateway for 100+ LLM providers.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    install_requires=["litellm>=1.55,<1.85", "openai", "composio"],
    include_package_data=True,
)
