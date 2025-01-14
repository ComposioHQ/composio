<p>
    <a href="https://github.com/composiohq/composio/blob/master/README.md">英语</a> | <a
        href="https://github.com/composiohq/composio/blob/master/README-CN.md">中国人</a> | <a
        href="https://github.com/composiohq/composio/blob/master/README-JP.md">日本人</a>
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
        <img src="https://img.shields.io/badge/Read%20the%20Documentation-Click%20Here-green?style=for-the-badge&logo=read-the-docs"
            alt="阅读文档">
    </a>
</p>

<p align="center">
    <a href="https://pypi.org/project/composio-core/">
        <img alt="PyPI"
            src="https://img.shields.io/pypi/v/composio_core?label=Latest&style=plastic&logo=pypi&color=blue&cacheSeconds=60&logoColor=white">
    </a>
    <a href="https://www.npmjs.com/package/composio-core">
        <img alt="NPM"
            src="https://img.shields.io/npm/v/composio-core?style=plastic&logo=npm&logoColor=white&label=latest&color=blue&cacheSeconds=60">
    </a>
    <a href="https://pypi.org/project/composio-core/">
        <img alt="Downloads"
            src="https://img.shields.io/pypi/dm/composio-core?label=Downloads&style=plastic&logo=github&color=blue&cacheSeconds=60">
    </a>
</p>

<h2 align="center">
    适用于 AI 代理的生产就绪工具集
</h2>

<img alt="Illustration" src="./python/docs/imgs/banner.gif" style="border-radius: 5px" />

<h2>什么是Composio?</h2>
<p><strong>Composio 为 AI 代理提供可用于生产的工具集</strong>，提供：</p>
<ul>
    <li>支持多个类别的 250 多种工具：
        <ul>
            <li>GitHub、Notion、Linear、Gmail、Slack、Hubspot、Salesforce 等软件工具 &
                <a href="https://app.composio.dev/apps">
                    更多
                </a>
            </li>
            <li>操作系统操作, 包括文件工具、shell 工具、代码分析工具 &
                <a href="https://app.composio.dev/apps">
                    更多
                </a>
            </li>
            <li>通过 Google、Perplexity、Tavily 和 Exa 实现搜索功能 &
                <a href="https://app.composio.dev/apps">
                    更多
                </a>
            </li>
        </ul>
    </li>
    <li>全面的框架支持，包括 OpenAI、 Groq、Claude、LlamaIndex、Langchain、CrewAI、Autogen、Gemini 以及<a
            href="https://docs.composio.dev/framework">更多</a></li>
    <li>支持多种协议 (OAuth、API 密钥、Basic JWT) 的托管身份验证</li>
    <li>通过优化设计将工具调用准确率提高高达 40%</li>
    <li>用于后端集成的白标解决方案</li>
    <li>支持自定义工具和扩展的可插拔架构</li>
</ul>

## 📋 目录

- [Python 入门](#开始使用-python)
    - [1. 安装](#1-安装)
    - [2. 创建代理并执行工具](#2-创建代理并执行工具)
- [JavaScript 入门](#javascript-入门)
    - [1. 安装](#1安装)
    - [2.创建代理并执行工具](#2-创建代理并执行工具-1)
- [示例](#示例)
    - [Python 示例](#python-示例)
    - [JavaScript 示例](#javascript-示例)
- [Star 历史](#星号历史)
- [获取帮助](#获取帮助)
- [贡献](#贡献)
- [请求功能](#请求功能)
- [感谢所有贡献者](#感谢所有贡献者)

## 开始使用 Python

### 1. 安装

首先安装软件包

```bash
pip install composio-core
```

安装“composio”包及其 openai 插件 `pip install composio-openai`.

### 2. 创建代理并执行工具

让我们使用 OpenAI 创建 AI 代理，并使用 Composio 的 GitHub 工具为 GitHub 存储库加注星标

> [!NOTE]
> 在您的环境变量中设置您的 COMPOSIO_API_KEY 和 OPENAI_API_KEY.

将你的 GitHub 帐户连接到 Composio
```bash
composio add github # Run this in terminal
```

```python

from openai import OpenAI
from composio_openai import ComposioToolSet, App, Action

openai_client = OpenAI(api_key="{{OPENAIKEY}}")

# 初始化 Composio 工具集

composio_tool_set = ComposioToolSet()

# 获取预先配置的 GitHub 工具
actions = composio_tool_set.get_actions(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

my_task = "Star a repo composiodev/composio on GitHub"

# 设置 openai 助手
assistant_instruction = "You are a super intelligent personal assistant"

assistant = openai_client.beta.assistants.create(
    name="Personal Assistant",
    instructions=assistant_instruction,
    model="gpt-4-turbo",
    tools=actions,
)

# 创建线程
thread = openai_client.beta.threads.create()

message = openai_client.beta.threads.messages.create(
    thread_id=thread.id, role="user", content=my_task
)

# 使用集成执行代理
run = openai_client.beta.threads.runs.create(
    thread_id=thread.id, assistant_id=assistant.id
)


# 执行函数调用
response_after_tool_calls = composio_tool_set.wait_and_handle_assistant_tool_calls(
    client=openai_client,
    run=run,
    thread=thread,
)

print(response_after_tool_calls)
```

## JavaScript 入门

要开始使用 JavaScript 中的 Composio SDK, 请按照以下步骤操作:

### 1.安装：
```bash
npm install composio-core
```

### 2. 创建代理并执行工具

让我们使用 OpenAI 创建一个 AI 代理，并使用 Composio 的 GitHub 工具来加注 GitHub 存储库

> [!NOTE]
> 在您的环境变量中设置您的 COMPOSIO_API_KEY 和 OPENAI_API_KEY。

将你的 GitHub 帐户连接到 Composio
```bash
composio add github # 在终端中运行
```

```javascript
import { OpenAIToolSet } from "composio-core";
import OpenAI from "openai";

const toolset = new OpenAIToolSet({ apiKey: process.env.COMPOSIO_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tools = await toolset.getTools({ actions: ["GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"] });

async function createGithubAssistant(openai, tools) {
    return await openai.beta.assistants.create({
        name: "Github Assistant",
        instructions: "You're a GitHub Assistant, you can do operations on GitHub",
        tools: tools,
        model: "gpt-4o"
    });
}

async function executeAssistantTask(openai, toolset, assistant, task) {
    const thread = await openai.beta.threads.create();
    const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id,
        instructions: task,
        tools: tools,
        model: "gpt-4o",
        stream: false
    });
    const call = await toolset.waitAndHandleAssistantToolCalls(openai, run, thread);
    console.log(call);
}

(async () => {
    const githubAssistant = await createGithubAssistant(openai, tools);
    await executeAssistantTask(
        openai,
        toolset,
        githubAssistant,
        "Star the repository 'composiohq/composio'"
    );
})();
```

## 示例

### [Python 示例](https://docs.composio.dev/guides/python/)

### [JavaScript 示例](https://docs.composio.dev/guides/javascript/)

## 星号历史

[![Star History
Chart](https://api.star-history.com/svg?repos=composiohq/composio&type=Date)](https://star-history.com/#composiohq/composio&Date)

## 获取帮助

- 阅读 <a href="https://docs.composio.dev" target="_blank" rel="noopener noreferrer">docs.composio.dev</a> 上的文档
- 在 <a href="https://discord.com/channels/1170785031560646836/1268871288156323901" target="_blank"
    rel="noopener noreferrer">discord</a> 上发布您的问题

## 贡献

我们是一个开源项目，欢迎贡献。请阅读<a href="https://github.com/composiodev/composio/blob/master/CONTRIBUTING.md" target="_blank"
    rel="noopener noreferrer">贡献指南</a>了解更多信息，并在开始之前查看我们的<a
    href="https://github.com/composiodev/composio/blob/master/CODE_OF_CONDUCT.md" target="_blank"
    rel="noopener noreferrer">行为准则</a>。

## 请求功能

- 如果您有功能请求，请打开<a
    href="https://github.com/composiodev/composio/issues/new?assignees=&labels=feature&template=feature_request.yml&title=%F0%9F%9A%80+Feature%3A+">问题</a>，
发出拉取请求，或在我们的<a href="https://discord.com/channels/1170785031560646836/1247166813205303379" target="_blank"
    rel="noopener noreferrer">功能请求频道</a>中提交。
- 如果您有改进想法，也可以在我们的 GitHub 存储库中发起讨论。

## 感谢所有贡献者

<a href="https://github.com/composiohq/composio/graphs/contributors">
    <img src="https://contributors-img.web.app/image?repo=composiodev/composio" alt="贡献者列表" />
</a>

<br><br>

<div align="center">
    <p>
        <a href="https://dub.composio.dev/JoinHQ" target="_blank" rel="noopener noreferrer">
            <img src="https://github.com/user-attachments/assets/c499721b-d3c2-4bfc-891f-4d74b587911f" alt="discord" />
        </a>&nbsp;&nbsp;&nbsp;
        <a href="https://www.youtube.com/@Composio" target="_blank" rel="noopener noreferrer">
            <img src="https://github.com/user-attachments/assets/57072338-3e7a-42a5-bd2b-c58b143ffa29" alt="youtube" />
        </a>&nbsp;&nbsp;&nbsp;
        <a href="https://twitter.com/composiohq" target="_blank" rel="noopener noreferrer">
            <img src="https://github.com/user-attachments/assets/14b87a1d-8ac7-48b4-ae7c-3a36aacc260b" alt="x" />
        </a>&nbsp;&nbsp;&nbsp;
        <a href="https://www.linkedin.com/company/composio-dev" target="_blank" rel="noopener noreferrer">
            <img src="https://github.com/user-attachments/assets/cb6cc650-672e-41f6-8abf-dfc97fddfcbc" alt="linkedin" />
        </a>
    </p>
</div>
