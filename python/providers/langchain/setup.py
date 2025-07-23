"""
Setup configuration for Composio OpenAI plugin.
"""

from pathlib import Path

from setuptools import setup

setup(
    name="composio_langchain",
    version="0.8.1",
    author="composio",
    author_email="tech@composio.dev",
    description="Use Composio to get an array of tools with your Langchain agent.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    install_requires=["langchain"],
    include_package_data=True,
)
