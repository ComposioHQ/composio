"""
Setup configuration for Composio Google AI Python Gemini plugin
"""

from pathlib import Path

from setuptools import setup

setup(
    name="composio_google",
    version="0.8.5",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio to get an array of tools with your Google AI Python Gemini model.",
    long_description=(Path(__file__).parent / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9,<4",
    install_requires=["google-cloud-aiplatform>=1.38.0", "vertexai"],
    include_package_data=True,
)
