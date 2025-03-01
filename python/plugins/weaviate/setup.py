"""
Setup configuration for Composio Weaviate plugin
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_weaviate",
    version="0.7.4",
    author="CShorten",
    author_email="connor@weaviate.io",
    description="Use Composio to get an array of tools with your Weaviate agent.",
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
        "weaviate-client==4.11.0",
        "weaviate_agents==0.3.3",
        "composio_core>=0.7.0,<0.8.0",
    ],
    include_package_data=True,
)