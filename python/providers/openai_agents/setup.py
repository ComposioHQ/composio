"""
Setup configuration for Composio OpenAI Agents plugin
"""

from pathlib import Path

from setuptools import find_packages, setup

setup(
    name="composio_openai_agents",
    version="0.8.6",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio to get array of strongly typed tools for OpenAI Agents",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    packages=find_packages(),
    install_requires=["openai-agents>=0.0.3"],
    include_package_data=True,
)
