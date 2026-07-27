"""Setup configuration for the composio crewai toolset"""

from pathlib import Path

from setuptools import setup

setup(
    name="composio_crewai",
    version="0.18.0",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio to get an array of tools with your CrewAI agent.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.10,<4",
    # CrewAI 1.7+ constrains Pydantic below composio's >=2.13.4 floor.
    install_requires=["crewai>=1.6.1,<1.7.0", "composio"],
    include_package_data=True,
)
