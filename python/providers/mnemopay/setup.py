"""Setup configuration for the composio mnemopay provider"""

from pathlib import Path

from setuptools import setup

setup(
    name="composio_mnemopay",
    version="0.1.0",
    author="MnemoPay",
    author_email="jerry@mnemopay.io",
    description="Use Composio to give any AI agent persistent memory and an escrow wallet via MnemoPay.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    install_requires=["composio"],
    include_package_data=True,
)
