"""
Setup configuration for Composio Pydantic AI plugin
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_pydanticai",
    version="0.6.16",
    author="Siddharth",
    author_email="tech@composio.dev",
    description="Use Composio to get array of strongly typed tools for Pydantic AI",
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
        "composio_core>=0.6.11,<0.7.0",
        "pydantic-ai",
    ],
    include_package_data=True,
)
