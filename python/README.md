<p align="center">
  <a href="https://composio.dev//#gh-dark-mode-only">
    <img src="./docs/imgs/composio_white_font.svg" width="318px" alt="Composio logo" />
  </a>
  <a href="https://composio.dev//#gh-light-mode-only">
    <img src="./docs/imgs/composio_black_font.svg" width="318px" alt="Composio Logo" />
  </a>
</p>
<p align="center">
  <a href="https://github.com/composiodev/composio/actions/workflows/common.yml">
  <img alt="Tests" src="https://img.shields.io/github/actions/workflow/status/composiodev/composio/common.yml?label=Tests&style=plastic&logo=github&color=blue&cacheSeconds=60">
  </a>
  <a href="https://pypi.org/project/composio-core/">
  <img alt="PyPI" src="https://img.shields.io/pypi/v/composio_core?label=Latest&style=plastic&logo=pypi&color=blue&cacheSeconds=60&logoColor=white">
  </a>
  <a href="https://pypi.org/project/composio-core/">
  <img alt="Downloads" src="https://img.shields.io/pypi/dm/composio-core?label=Downloads&style=plastic&logo=github&color=blue&cacheSeconds=60">
  </a>
  <img alt="Downloads" src="https://codecov.io/gh/ComposioHQ/composio/graph/badge.svg?token=33H5QHUF7S">
</p>
<h2 align="center"><i>
  Production Ready Toolset for AI Agents
</i></h2>  
<h4 align="center">Equip your agent with high-quality tools & integrations without worrying about authentication, accuracy, and reliability in a single line of code!
</h4>
<div align="center">
<p>
<a href="https://docs.composio.dev" rel="dofollow"><strong>Explore the Docs »</strong></a>
</p>

<p>
<a href="https://app.composio.dev">Try on Dashboard</a> <b>|</b>
<a href="https://www.composio.dev">Homepage</a> <b>|</b>
<!-- <a href="https://docs.composio.dev/guides/examples">Examples</a> |
<a href="https://docs.composio.dev/chat-with-docs">Chat with Docs</a> | -->
<a href="https://docs.composio.dev/sdk">SDK</a> <b>|</b>
<a href="https://docs.composio.dev/api-reference/">APIs</a> 
</p>
</div>

<hr>
<div align="center">
<p >
    <b>✨ Socials >></b>
    <a href="https://discord.gg/XMa3eWKkH8">Discord</a> <b>|</b>
    <a href="https://www.youtube.com/@Composio">Youtube</a> <b>|</b>
    <a href="https://twitter.com/composiohq">Twitter</a> <b>|</b>
    <a href="https://www.linkedin.com/company/composio-dev"> Linkedin </a>
</p>
<p align="center">
    <b>⛏️ Contribute >></b>
    <a href="https://github.com/composiodev/composio/issues/new?assignees=&labels=type%3A+bug&template=bug_report.yml&title=%F0%9F%90%9B+Bug+Report%3A+">Report Bugs</a> <b>|</b>
    <a href="https://github.com/composiodev/composio/issues/new?assignees=&labels=feature&template=feature_request.yml&title=%F0%9F%9A%80+Feature%3A+">Request Feature</a> <b>|</b>
    <a href="https://github.com/composiodev/composio/blob/master/CONTRIBUTING.md">Contribute</a>
</p>
</div>

## 📋 Table of contents

- [📋 Table of contents](#-table-of-contents)
- [🤔 Why Composio?](#-why-composio)
- [🔥 Key Features](#-key-features)
- [🚀 Getting Started](#-getting-started)
  - [1. Installation](#1-installation)
  - [2. Testing Composio in Action](#2-testing-composio-in-action)
- [💡 Examples](#-examples)
  - [Competitor Researcher](#competitor-researcher)
  - [Todolist to Calendar](#todolist-to-calendar)
  - [Github to Trello](#github-to-trello)
- [Star History](#star-history)
- [📋 Read Our Code Of Conduct](#-read-our-code-of-conduct)
- [🤗 Contributions](#-contributions)
- [🔗 Links](#-links)
- [🛡️ License](#️-license)
- [💪 Thanks To All Contributors](#-thanks-to-all-contributors)

## 🤔 Why Composio?

We believe AI Based Agents/Workflows are the future.
Composio is the best toolset to integrate AI Agents to best Agentic Tools and use them to accomplish tasks.

<img alt="Illustration" src="./docs/imgs/banner.gif" style="border-radius: 5px"/>

## 🔥 Key Features

- **100+ Tools**: Support for a range of different categories

  - **Software**: Do anything on GitHub, Notion, Linear, Gmail, Slack, Hubspot, Salesforce, & 90 more.
  - **OS**: Click anywhere, Type anything, Copy to Clipboard, & more.
  - **Browser**: Smart Search, Take a screenshot, MultiOn, Download, Upload, & more.
  - **Search**: Google Search, Perplexity Search, Tavily, Exa & more.
  - **SWE**: Ngrok, Database, Redis, Vercel, Git, etc.
  - **RAG**: Agentic RAG for any type of data on the fly!

- **Frameworks**: Use tools with agent frameworks like **OpenAI, Claude, LlamaIndex, Langchain, CrewAI, Autogen, Gemini, Julep, Lyzr**, and more in a single line of code.
- **Managed Authorisation**: Supports six different auth protocols. _Access Token, Refresh token, OAuth, API Keys, JWT, and more_ abstracted out so you can focus on the building agents.
- **Accuracy**: Get _upto 40% better agentic accuracy_ in your tool calls due to better tool designs.
- **Embeddable**: Whitelabel in the backend of your applications managing Auth & Integrations for all your users & agents and maintain a consistent experience.
- **Pluggable**: Designed to be extended with additional Tools, Frameworks and Authorisation Protocols very easily.

## 🚀 Getting Started

### 1. Installation

To get started, type the following command in your Terminal.

```bash
pip install composio-core
```

If you want to install the 'composio' package along with its openai plugin: `pip install composio-openai`.

### 2. Testing Composio in Action

Let's use Composio to create an AI Agent that can star a Github Repo.

```bash
composio add github # Connect your Github - Run this in terminal
```

```python

from openai import OpenAI
from composio_openai import ComposioToolSet, App, Action

openai_client = OpenAI(
    api_key="{{OPENAIKEY}}"
)

# Initialise the Composio Tool Set

composio_tool_set = ComposioToolSet()

# Get GitHub tools that are pre-configured
actions = composio_tool_set.get_actions(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

my_task = "Star a repo composiodev/composio on GitHub"

# Setup openai assistant
assistant_instruction = "You are a super intelligent personal assistant"

assistant = openai_client.beta.assistants.create(
    name="Personal Assistant",
    instructions=assistant_instruction,
    model="gpt-4-turbo",
    tools=actions,
)

# create a thread
thread = openai_client.beta.threads.create()

message = openai_client.beta.threads.messages.create(
    thread_id=thread.id,
    role="user",
    content=my_task
)

# Execute Agent with integrations
run = openai_client.beta.threads.runs.create(
    thread_id=thread.id,
    assistant_id=assistant.id
)


# Execute Function calls
response_after_tool_calls = composio_tool_set.wait_and_handle_assistant_tool_calls(
    client=openai_client,
    run=run,
    thread=thread,
)

print(response_after_tool_calls)
```

## 💡 Examples

### [Competitor Researcher](https://docs.composio.dev/guides/examples/CompetitorResearcher)

### [Todolist to Calendar](https://docs.composio.dev/guides/examples/todo-to-calendar)

### [Github to Trello](https://docs.composio.dev/guides/examples/github-trello)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=composiohq/composio&type=Date)](https://star-history.com/#composiohq/composio&Date)


## 📋 Read Our Code Of Conduct

As part of our open-source community, we hold ourselves and other contributors to a high standard of communication. As a participant and contributor to this project, you agree to abide by our [Code of Conduct](https://github.com/composiodev/composio/blob/master/CODE_OF_CONDUCT.md).

## 🤗 Contributions

Composio is open-source and we welcome contributions. Please fork the repository, create a new branch for your feature, add your feature or improvement, and send a pull request.

Also go through our [Contribution Guidelines](https://github.com/composiodev/composio/blob/master/CONTRIBUTING.md) and [Code of Conduct](https://github.com/composiodev/composio/blob/master/CODE_OF_CONDUCT.md) before you start.

## 🔗 Links

- [Home page](https://composio.dev?utm_campaign=github-readme)
- [Contribution Guidelines](https://github.com/composiodev/composio/blob/master/CONTRIBUTING.md)
- [Docs](https://docs.composio.dev/?utm_campaign=github-readme)

## 🛡️ License

Composio is licensed under the Elastic License - see the [LICENSE](https://github.com/composiodev/composio/blob/master/LICENSE) file for details.

## 💪 Thanks To All Contributors

<a href="https://github.com/composiohq/composio/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=composiodev/composio" alt="List of Contributors"/>
</a>
