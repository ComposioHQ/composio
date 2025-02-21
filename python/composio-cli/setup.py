"""
Setup configuration for composio CLI.
"""

from pathlib import Path
from setuptools import setup, find_packages

# Read README for long description
README = Path(__file__).parent / "README.md"
long_description = README.read_text(encoding="utf-8") if README.exists() else ""

setup(
    name="composio-cli",
    version="0.7.2",  # Keeping in sync with core for now
    author="Utkarsh",
    author_email="utkarsh@composio.dev",
    description="Command line interface for Composio platform",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/composiohq/composio",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
    ],
    python_requires=">=3.8",
    install_requires=[
        "composio_core>=0.7.2",  # Core package dependency
        "click",
        "rich>=13.7.1,<14",
        "pyperclip>=1.8.2,<2",
    ],
    entry_points={
        "console_scripts": [
            "composio=composio_cli.cli:composio",
        ],
    },
)
