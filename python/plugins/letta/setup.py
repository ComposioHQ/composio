"""
Setup configuration for Composio Langchain plugin
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_letta",
    version="0.5.28",
    author="Karan",
    author_email="karan@composio.dev",
    description="Use Composio to get an array of tools with your Letta agent.",
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
        "letta>=0.1.6",
        "composio_crewai==0.5.28",
    ],
    include_package_data=True,
)
