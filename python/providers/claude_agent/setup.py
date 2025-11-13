from setuptools import setup, find_packages

setup(
    name="composio_claude_agent",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "composio>=0.1.0",
        "claude-agent-sdk>=0.1.6,<0.2.0",
    ],
    python_requires=">=3.10,<4",
    author="Composio",
    author_email="tech@composio.dev",
    description="Agentic Provider for Claude Agent in the Composio SDK",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/ComposioHQ/composio",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: Apache Software License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
