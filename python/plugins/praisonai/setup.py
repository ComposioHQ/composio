"""
Setup configuration for Composio OpenAI plugin.
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_praisonai",
    version="0.5.44",
    author="Sawradip",
    author_email="sawradip@composio.dev",
    description="Use Composio Tools to enhance your PraisonAI agents capabilities.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9",
    install_requires=["composio_core>=0.5.40,<=0.5.44", "PraisonAI>=0.0.2"],
    include_package_data=True,
)
