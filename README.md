<p>
  <a href="https://github.com/composiohq/composio/blob/master/README.md">EN</a> | <a href="https://github.com/composiohq/composio/blob/master/README-CN.md">CN</a> | <a href="https://github.com/composiohq/composio/blob/master/README-JP.md">JP</a>
</p>
<p align="center">
  <a href="https://composio.dev//#gh-dark-mode-only">
    <img src="./python/docs/imgs/composio_white_font.svg" width="318px" alt="Composio logo" />
  </a>
  <a href="https://composio.dev//#gh-light-mode-only">
    <img src="./python/docs/imgs/composio_black_font.svg" width="318px" alt="Composio Logo" />
  </a>
</p>
<p align="center">
  <a href="https://docs.composio.dev">
    <img src="https://img.shields.io/badge/Read%20the%20Documentation-Click%20Here-green?style=for-the-badge&logo=read-the-docs" alt="Read the Docs">
  </a>
</p>

<p align="center">
  <a href="https://pypi.org/project/composio-core/">
  <img alt="PyPI" src="https://img.shields.io/pypi/v/composio_core?label=Latest&style=plastic&logo=pypi&color=blue&cacheSeconds=60&logoColor=white">
  </a>
  <a href="https://www.npmjs.com/package/composio-core">
  <img alt="NPM" src="https://img.shields.io/npm/v/composio-core?style=plastic&logo=npm&logoColor=white&label=latest&color=blue&cacheSeconds=60">
  </a>
  <a href="https://pypi.org/project/composio-core/">
  <img alt="Downloads" src="https://img.shields.io/pypi/dm/composio-core?label=Downloads&style=plastic&logo=github&color=blue&cacheSeconds=60">
  </a>
</p>

<h2 align="center">
  Production Ready Toolset for AI Agents
</h2>

<img alt="Illustration" src="./python/docs/imgs/banner.gif" style="border-radius: 5px"/>

<h2>What is Composio?</h2>
<p><strong>Composio provides production-ready toolset for AI agents</strong>, offering:</p>
<ul>
    <li>Support for over 250+ tools across multiple categories:
        <ul>
            <li>Software tools like GitHub, Notion, Linear, Gmail, Slack, Hubspot, Salesforce & 
              <a href="https://app.composio.dev/apps">
                more
              </a>
            </li>
            <li>OS operations including file tool, shell tool, code analysis tool &
              <a href="https://app.composio.dev/apps">
                more
              </a>
            </li>
            <li>Search capabilities through Google, Perplexity, Tavily, and Exa & 
              <a href="https://app.composio.dev/apps">
                more
              </a>
            </li>
        </ul>
    </li>
    <li>Comprehensive framework support including OpenAI, Groq, Claude, LlamaIndex, Langchain, CrewAI, Autogen, Gemini, and <a href="https://docs.composio.dev/framework">more</a></li>
    <li>Managed authentication supporting multiple protocols (OAuth, API Keys, Basic JWT)</li>
    <li>Up to 40% improved tool call accuracy through optimized design</li>
    <li>Whitelabel solution for backend integration</li>
    <li>Pluggable architecture supporting custom tools and extensions</li>
</ul>

<div align="center">
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
    <b>Socials >></b>
    <a href="https://dub.composio.dev/JoinHQ">Discord</a> <b>|</b>
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

- [🚀 Getting Started with Python](#-getting-started-with-python)
  - [1. Installation](#1-installation)
  - [2. Testing Composio in Action](#2-testing-composio-in-action)
- [🚀 Getting Started with Javascript](#-getting-started-with-javascript)
  - [1. **Install the Composio SDK**:](#1-install-the-composio-sdk)
  - [2. **Setup the OpenAI and Composio Tool Set**:](#2-setup-the-openai-and-composio-tool-set)
  - [3. **Run your script**:](#3-run-your-script)
- [💡 Examples](#-examples)
  - [Python Examples](#python-examples)
  - [Javascript Examples](#javascript-examples)
- [Star History](#star-history)
- [📋 Read Our Code Of Conduct](#-read-our-code-of-conduct)
- [🤗 Contributions](#-contributions)
- [💪 Thanks To All Contributors](#-thanks-to-all-contributors)


## Getting Started with Python

### 1. Installation

Start by installing the package

```bash
pip install composio-core
```

If you want to install the 'composio' package along with its openai plugin: `pip install composio-openai`.

### 2. Creating an agent & executing tool call

Let's create an AI Agent using OpenAI and use Composio's GitHub tool to star a GitHub repository.

> [!NOTE] You need to 
```bash
composio add github # Connect your GitHub - Run this in terminal
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

## Getting Started with JavaScript

To get started with the Composio SDK in JavaScript, follow these steps:

### 1. **Install the Composio SDK**:
   ```bash
   npm install composio-core
   ```

### 2. **Setup the OpenAI and Composio Tool Set**:
   ```javascript
   import { OpenAI } from "openai";
   import { OpenAIToolSet } from "composio-core";

   const toolset = new OpenAIToolSet({
       apiKey: process.env.COMPOSIO_API_KEY,
   });

   async function setupUserConnectionIfNotExists(entityId) {
       const entity = await toolset.client.getEntity(entityId);
       const connection = await entity.getConnection('github');

       if (!connection) {
           // If this entity/user hasn't already connected the account
           const connection = await entity.initiateConnection(appName);
           console.log("Log in via: ", connection.redirectUrl);
           return connection.waitUntilActive(60);
       }

       return connection;
   }

   async function executeAgent(entityName) {
       const entity = await toolset.client.getEntity(entityName)
       await setupUserConnectionIfNotExists(entity.id);

       const tools = await toolset.get_actions({ actions: ["github_issues_create"] }, entity.id);
       const instruction = "Make an issue with sample title in the repo - himanshu-dixit/custom-repo-breaking"

       const client = new OpenAI({ apiKey: process.env.OPEN_AI_API_KEY })
       const response = await client.chat.completions.create({
           model: "gpt-4-turbo",
           messages: [{
               role: "user",
               content: instruction,
           }],
           tools: tools,
           tool_choice: "auto",
       })

       console.log(response.choices[0].message.tool_calls);
       await toolset.handle_tool_call(response, entity.id);
   }

   executeAgent("your-entity-name");
   ```

### 3. **Run your script**:
   ```bash
   node your_script.js
   ```

This will set up the Composio SDK and execute an agent that creates a GitHub issue using the provided instructions.

For more details, refer to the [Composio SDK Documentation](https://docs.composio.dev/).


## Examples

### [Python Examples](https://docs.composio.dev/guides/python/)

### [Javascript Examples](https://docs.composio.dev/guides/javascript/)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=composiohq/composio&type=Date)](https://star-history.com/#composiohq/composio&Date)

## Getting help

- Read the docs at <a href="https://docs.composio.dev" target="_blank" rel="noopener noreferrer">docs.composio.dev</a>
- Post your questions on <a href="https://discord.com/channels/1170785031560646836/1268871288156323901" target="_blank" rel="noopener noreferrer">discord</a>

### Check out the [cookbook](https://github.com/phidatahq/phidata/tree/main/cookbook) for more examples.

## Contributions

We're an open-source project and welcome contributions. Please read the <a href="https://github.com/composiodev/composio/blob/master/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">contributing guide</a> for more information. Please check our <a href="https://github.com/composiodev/composio/blob/master/CODE_OF_CONDUCT.md" target="_blank" rel="noopener noreferrer">code of conduct</a> before you start.

## Request a feature

- If you have a feature request, please open an issue, make a pull request, or submit it in our <a href="https://discord.com/channels/1170785031560646836/1247166813205303379" target="_blank" rel="noopener noreferrer">feature requests channel</a>.
- If you have ideas for improvements, you can also start a discussion in our GitHub repository.
  
## Thanks To All Contributors

<a href="https://github.com/composiohq/composio/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=composiodev/composio" alt="List of Contributors"/>
</a>
