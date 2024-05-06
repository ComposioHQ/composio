
<p align="center">
  <picture width="200">
    <source media="(prefers-color-scheme: dark)" width="200" srcset="https://mintlify.s3-us-west-1.amazonaws.com/composio-27/logo/dark.svg">
    <img alt="Text changing depending on mode. Light: 'So light!' Dark: 'So dark!'" width="200" src="https://mintlify.s3-us-west-1.amazonaws.com/composio-27/logo/light.svg"/>
  </picture>
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

<img alt="Illustraion" src="./docs/workflow.png" style="border-radius: 5px"/>

Composio provides a platform that seamlessly integrates over 200+ apps with your AI agents, enhancing their utility and interactivity. It supports all the features you'll ever need:

- **Compatibility with Major Agent Frameworks**: Autogen, Langchain, CrewAI, Julep, Lyzr, and OpenAI are all compatible with Composio, giving you a simple experience for your workflows.
- **Full Support for Actions & Triggers**: Composio provides full support for Actions & Triggers, to power your agents with a wide range of functionalities.
- **Authentication Management**: Composio provides comprehensive management of all authentication types, including `OAuth2`, `OAuth1`, `Basic`, `API_KEY`.
- **Extensibility**: Don't find a tool you need? Composio is highly extensible, allowing you to add your own set of custom tools.
- **Secure Environment**: Every user has a secure compute environment, ensuring data protection and privacy.

## Getting started
 To get started, select the framework you want to use and install the correseponding package:
- **Autogen**: `pip install composio_autogen`
- **CrewAI**: `pip install composio_crewai`
- **Langchain**: `pip install composio_langchain`
- **Lyzr**: `pip install composio_lyzr`
- **OpenAI**: `pip install composio_openai`

Login now into your composio account, using the  below CLI command:
```shell 
composi-cli login
```

<hr/>

### Run a sample use-cases repo for your framework
The below sample repos are provided to help you get started with Composio. Follow the README.md to start these agents.

| Framework | Use-Case | GitHub Repo | Features Used |
| --- | --- | --- | --- |
| Autogen | Sample  | [GitHub Repo](https://github.com/username/repo) | - |
| CrewAI | Competitor research agent that is triggered with a slack message, starts researching about the said topic and  finally creates a page on notion and reply back to slack. | [GitHub Repo](https://github.com/username/repo) | ![](https://img.shields.io/badge/triggers-8A2BE2) ![](https://img.shields.io/badge/actions-8A2BE2) ![](https://img.shields.io/badge/auth-8A2BE2)
| Langchain | Notion - Product Discussion Agent: An agent that creates linear isseus fronm the production discussions in notion. | [GitHub Repo](https://github.com/username/repo) | ![](https://img.shields.io/badge/actions-8A2BE2) ![](https://img.shields.io/badge/auth-8A2BE2)
| Lyzr | Repo Recommender - Lyzer agent that analyzes your previous starred repos and notifies you a similar repo that you might be interested in. | [GitHub Repo](https://github.com/username/repo) | ![](https://img.shields.io/badge/actions-8A2BE2) ![](https://img.shields.io/badge/auth-8A2BE2)
| OpenAI | Sample Use-Case | [GitHub Repo](https://github.com/username/repo) | - |

## Resources
- Docs: https://docs.composio.dev/
- Discord: https://discord.gg/composio
- Twitter: https://twitter.com/composiohq

## Contributing
Checkout `CONTRIBUTING.md` to get started with contributing to SDK. Feel free to reach out to us on [Discord](https://discord.gg/composio) for any questions or issues. We value your feedback!
