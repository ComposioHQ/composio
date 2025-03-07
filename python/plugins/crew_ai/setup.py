"""
Setup configuration for Composio CrewAI plugin
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_crewai",
    version="0.7.6",
    author="Himanshu",
    author_email="himanshu@composio.dev",
    description="Use Composio to get an array of tools with your CrewAI agent.",
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
        "composio_langchain>=0.5.0,<0.8.0",
        "crewai>=0.51.0",
        "semver>=2.13.0",
    ],
    include_package_data=True,
)
