"""Setup script for composio-livekit package."""

from setuptools import find_packages, setup

setup(
    name="composio-livekit",
    version="0.10.1",
    author="Composio",
    author_email="tech@composio.dev",
    description="Use Composio to get an array of tools with your LiveKit Agents.",
    long_description=open("README.md", encoding="utf-8").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    packages=find_packages(include=["composio_livekit", "composio_livekit.*"]),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.10",
    install_requires=[
        "livekit-agents>=1.0.0",
        "composio",
    ],
    include_package_data=True,
    package_data={"composio_livekit": ["py.typed"]},
)
