
<p align="center">
  <img src="https://mintlify.s3-us-west-1.amazonaws.com/composio-27/logo/dark.svg" width="200"/>
  <h4 align="center">Composio SDK: Equip your agent with high-quality tools and <br/>build your real-world usecase</h4>
  <hr/>
  <p align="center">
    <img alt="Tests" src="https://github.com/SamparkAI/composio_sdk/actions/workflows/common.yml/badge.svg">
  <img alt="PyPI" src="https://img.shields.io/pypi/v/composio_core?label=Latest">
    <img alt="Docs" src="https://img.shields.io/badge/Docs-Live-blue">
    <img alt="Twitter" src="https://img.shields.io/twitter/url?url=https%3A%2F%2Ftwitter.com%2Fcomposiohq&label=Follow us">
    <img alt="Discord" src="https://img.shields.io/discord/1170785031560646836?label=Discord">
    </p>
</p>

Composio provides an innovative platform that seamlessly integrates over 200+ apps with your AI agents, enhancing their utility and interactivity. It enables developers to create more effective workflows by linking their platforms and user-preferred apps through a robust pipeline. It supports all major agentic frameworks out of the box: Autogen, Langchain, CrewAI, and more.

![Illustraion](illustration.png)

## Overview
Explore the various Python SDKs offered by Composio for enhanced integration and development:
1. **Core** - Access the foundational APIs necessary for basic operations.
2. **Autogen** - Integrate Composio's tools seamlessly with Autogen technology.
3. **CrewAI** - Leverage CrewAI capabilities within your Composio projects.
4. **Langchain** - Implement Langchain solutions using Composio's robust framework.

## Setting Up Your Development Environment
To prepare your development environment, follow these steps:
- Confirm that your system has Python (version 3.8 or higher, but less than 4) and `pipenv` installed.
- Clone the SDK repository using the command:
    ```
    git clone git@github.com:SamparkAI/composio_sdk
    ```
- Set up and activate a virtual environment. This step should be repeated whenever you need to refresh your environment and update dependencies:
    ```
    make env && pipenv shell
    ```

## SDK Release Process
To release a new version of the SDK, execute the following commands:
