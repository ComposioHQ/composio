"""
Setup configuration for Composio Pydantic AI plugin
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_swarm",
    version="0.6.12",
    author="Prathit",
    author_email="tech@composio.dev",
    description="Use Composio to get array of tools for Swarm",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.10,<4",
    install_requires=[
        "composio_core>=0.6.11,<0.7.0",
        "swarm @ git+https://github.com/openai/swarm.git",
    ],
    include_package_data=True,
)
