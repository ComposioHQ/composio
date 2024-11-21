"""
Setup configuration for Composio Google AI Python Gemini plugin
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_google",
    version="0.5.44",
    author="Assistant",
    author_email="karan@composio.dev",
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
    install_requires=[
        "composio_core>=0.5.40,<=0.5.44",
        "google-cloud-aiplatform>=1.38.0",
    ],
    include_package_data=True,
)
