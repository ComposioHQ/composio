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
    python_requires=">=3.10,<4",
    packages=find_packages(include=["composio*"]),
    install_requires=[
        "pysher>=1.0.8",
        "pydantic>=2.11.9",
        "composio-client==1.43.0",
        "typing-extensions>=4.16.0",
        "openai>=2.48.0",
        "json-schema-to-pydantic>=0.4.11",
        "jsonschema>=4.23.0",
        # `get_connection_with_tls_context` (the pinning adapter's mount
        # point) is only called by `HTTPAdapter.send` on requests >= 2.32.2.
        "requests>=2.32.2",
        # `url_safety` imports urllib3 directly and needs 2.x: 1.x has no
        # `NameResolutionError` and different connection internals.
        "urllib3>=2",
    ],
    include_package_data=True,
)
