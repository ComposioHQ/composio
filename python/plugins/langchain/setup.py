"""
Setup configuration for Composio Langchain plugin
"""

from pathlib import Path

from setuptools import setup


setup(
    name="composio_langchain",
    version="0.5.14",
    author="Karan",
    author_email="karan@composio.dev",
    description="Use Composio to get an array of tools with your LangChain agent.",
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
        "langchain>=0.1.0",
        "langchain-openai>=0.0.2.post1",
        "pydantic>=2.6.4",
        "langchainhub>=0.1.15",
        "composio_core==0.5.14",
    ],
    include_package_data=True,
)
