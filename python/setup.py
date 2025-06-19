"""
Setup configuration for compsio core.
"""

from pathlib import Path

from setuptools import find_packages, setup


setup(
    name="composio",
    author="Composio",
    author_email="tech@composio.dev",
    description="Core package to act as a bridge between composio platform and other services.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/composiohq/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    packages=find_packages(include=["composio*"]),
    install_requires=[
        "pysher==1.0.8",
        "pydantic>=2.6.4",
        "composio-client==1.3.0",
        "typing-extensions>=4.0.0",
    ],
    include_package_data=True,
)
