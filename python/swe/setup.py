"""
Setup configuration for Composio SWE Agent plugin
"""

from pathlib import Path

from setuptools import find_packages, setup


setup(
    name="composio_swe",
    version="0.0.1",
    author="Shubhra",
    author_email="shubhra@composio.dev",
    description="Tools for running a SWE agent using Composio platform",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/SamparkAI/composio_sdk",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    packages=find_packages(include=["composio_swe*"]),
    entry_points={
        "console_scripts": [
            "composio-swe=composio_swe.cli:cli",
        ],
    },
    install_requires=[
        "composio_core>=0.3.9",
        "gitpython>=3.1.43",
        "composio_crewai>=0.3.9",
        "crewai==0.30.11",
        "datasets>=2.20.0",
        "swebench>=1.1.0",
        "langchain_anthropic",
        "llama-index-llms-anthropic",
        "swe_bench_docker @ git+https://github.com/ComposioHQ/SWE-bench-docker.git",
    ],
    dependency_links=[
        "git+https://github.com/ComposioHQ/SWE-bench-docker.git",
    ],
    include_package_data=True,
)
