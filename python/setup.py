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
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.11,<3.16",
    packages=find_packages(include=["composio*"]),
    # Keep in sync with pyproject.toml, which explains the upper bounds.
    install_requires=[
        # Unmaintained since 2022: pin exactly. websocket-client is its transport.
        "pysher==1.0.8",
        "websocket-client<2",
        "pydantic>=2.11.9,<3",
        "composio-client==2.0.0rc23",
        "typing-extensions>=4.16.0,<5",
        "openai>=2.48.0,<4",
        "json-schema-to-pydantic>=0.4.11,<1",
        "jsonschema>=4.23.0,<5",
        # `get_connection_with_tls_context` (the pinning adapter's mount
        # point) is only called by `HTTPAdapter.send` on requests >= 2.32.2.
        # 2.32.4 fixes GHSA-9hjg-9r4m-mvj7 (.netrc credentials leak).
        "requests>=2.32.4,<3",
        # `url_safety` imports urllib3 directly and needs 2.x: 1.x has no
        # `NameResolutionError` and different connection internals.
        # 2.7.0 fixes GHSA-mf9v-mfxr-j63j and GHSA-qccp-gfcp-xxvc.
        "urllib3>=2.7.0,<3",
        # `requests` verifies TLS against certifi's bundle. 2026.10.19 drops
        # the emSign ECC Root CA - G3 root (compromised eMudhra intermediates).
        # No upper bound: a cap would block future CA bundle updates.
        "certifi>=2026.10.19",
    ],
    include_package_data=True,
)
