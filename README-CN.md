<p>
  <a href="https://github.com/ComposioHQ/composio/blob/master/README.md">EN</a> | <a href="https://github.com/ComposioHQ/composio/blob/master/README-CN.md">CN</a>
</p>


<p align="center">
  <a href="https://composio.dev//#gh-dark-mode-only">
    <img src="./python/docs/imgs/composio_white_font.svg" width="318px" alt="Composio 标志" />
  </a>
  <a href="https://composio.dev//#gh-light-mode-only">
    <img src="./python/docs/imgs/composio_black_font.svg" width="318px" alt="Composio 标志" />
  </a>
</p>
<p align="center">
  <a href="https://github.com/composiodev/composio/actions/workflows/common.yml">
  <img alt="测试" src="https://img.shields.io/github/actions/workflow/status/composiodev/composio/common.yml?label=Tests&style=plastic&logo=github&color=blue&cacheSeconds=60">
  </a>
  <a href="https://pypi.org/project/composio-core/">
  <img alt="PyPI" src="https://img.shields.io/pypi/v/composio_core?label=最新版本&style=plastic&logo=pypi&color=blue&cacheSeconds=60&logoColor=white">
  </a>
  <a href="https://pypi.org/project/composio-core/">
  <img alt="下载量" src="https://img.shields.io/pypi/dm/composio-core?label=下载量&style=plastic&logo=github&color=blue&cacheSeconds=60">
  </a>
</p>

<h2 align="center"><i>
  面向 AI 代理的生产就绪型工具集
</i></h2>

<h4 align="center">只需一行代码，即可为您的代理配备高质量的工具和集成，无需担心身份验证、准确性和可靠性！
</h4>

<div align="center">
<p>
<a href="https://docs.composio.dev" rel="dofollow"><strong>探索文档 »</strong></a>
</p>

<p>
<a href="https://app.composio.dev">在仪表板上试用</a> <b>|</b>
<a href="https://www.composio.dev">主页</a> <b>|</b>
<a href="https://docs.composio.dev/sdk">SDK</a> <b>|</b>
<a href="https://docs.composio.dev/api-reference/">APIs</a> 
</p>
</div>

<hr>
<div align="center">
<p >
    <b>✨ 社交媒体 >></b>
    <a href="https://dub.composio.dev/JoinHQ">Discord</a> <b>|</b>
    <a href="https://www.youtube.com/@Composio">Youtube</a> <b>|</b>
    <a href="https://twitter.com/composiohq">Twitter</a> <b>|</b>
    <a href="https://www.linkedin.com/company/composio-dev">LinkedIn</a>
</p>
<p align="center">
    <b>⛏️ 贡献 >></b>
    <a href="https://github.com/composiodev/composio/issues/new?assignees=&labels=type%3A+bug&template=bug_report.yml&title=%F0%9F%90%9B+Bug+Report%3A+">报告错误</a> <b>|</b>
    <a href="https://github.com/composiodev/composio/issues/new?assignees=&labels=feature&template=feature_request.yml&title=%F0%9F%9A%80+Feature%3A+">请求功能</a> <b>|</b>
    <a href="https://github.com/composiodev/composio/blob/master/CONTRIBUTING.md">参与贡献</a>
</p>
</div>

## 📋 目录

- [📋 目录](#-目录)
- [🤔 为什么选择 Composio？](#-为什么选择-composio)
- [🔥 主要特性](#-主要特性)  
- [🚀 Python 快速入门](#-python-快速入门)
  - [1. 安装](#1-安装)
  - [2. Composio 实战测试](#2-composio-实战测试)
- [🚀 Javascript 快速入门 ](#-javascript-快速入门) 
  - [1. 安装 Composio SDK](#1-安装-composio-sdk)
  - [2. 配置 OpenAI 和 Composio 工具集](#2-配置-openai-和-composio-工具集)
- [💡 示例](#-示例)
  - [竞争对手研究员](#竞争对手研究员) 
  - [待办事项列表转日历](#待办事项列表转日历)
  - [Github 到 Trello](#github-到-trello)
- [📋 阅读我们的行为准则](#-阅读我们的行为准则) 
- [🤗 贡献](#-贡献)
- [🔗 链接](#-链接)
- [🛡️ 许可证](#️-许可证)
- [💪 感谢所有贡献者](#-感谢所有贡献者)

## 🤔 为什么选择 Composio？

我们相信基于 AI 的代理/工作流是未来。
Composio 是将 AI 代理集成到最佳代理工具并用它们完成任务的最佳工具集。

<img alt="插图" src="./docs/imgs/banner.gif" style="border-radius: 5px"/>

## 🔥 主要特性

- **100+ 工具**：支持各种不同类别
  - **软件**：在 GitHub、Notion、Linear、Gmail、Slack、Hubspot、Salesforce 等 90 多个平台上执行任何操作。
  - **操作系统**：点击任意位置、输入任何内容、复制到剪贴板等。
  - **浏览器**：智能搜索、截图、MultiOn、下载、上传等。
  - **搜索**：Google 搜索、Perplexity 搜索、Tavily、Exa 等。 
  - **软件工程**：Ngrok、数据库、Redis、Vercel、Git 等。
  - **RAG**：即时为任何类型的数据提供代理 RAG！

- **框架**：通过一行代码在 **OpenAI、Claude、LlamaIndex、Langchain、CrewAI、Autogen、Gemini、Julep、Lyzr** 等代理框架中使用工具。
- **托管授权**：支持六种不同的身份验证协议。将 _Access Token、Refresh Token、OAuth、API Keys、JWT 等_ 抽象出来，让您专注于构建代理。
- **准确性**：由于更好的工具设计，您的工具调用的 _代理准确性提高了 40%_。
- **可嵌入**：在应用程序后端进行白标，为所有用户和代理管理身份验证和集成，保持一致的体验。
- **可插拔**：设计为可轻松扩展其他工具、框架和身份验证协议。

## 🚀 Python 快速入门

### 1. 安装

要开始使用，请在终端中键入以下命令。

```bash
pip install composio-core
```

如果您想安装带有 openai 插件的 'composio' 包：`pip install composio-openai`。

### 2. Composio 实战测试

让我们使用 Composio 创建一个可以为 Github 仓库点赞的 AI 代理。

```bash
composio add github # 连接您的 Github - 在终端中运行
```

```python
from openai import OpenAI
from composio_openai import ComposioToolSet, App, Action

openai_client = OpenAI(
    api_key="{{OPENAIKEY}}"
)

# 初始化 Composio 工具集

composio_tool_set = ComposioToolSet()

# 获取预配置的 GitHub 工具
actions = composio_tool_set.get_actions(
    actions=[Action.GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER]
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
    thread_id=thread.id,
    role="user",
    content=my_task
)

# 使用集成执行代理
run = openai_client.beta.threads.runs.create(
    thread_id=thread.id,
    assistant_id=assistant.id
)

# 执行函数调用
response_after_tool_calls = composio_tool_set.wait_and_handle_assistant_tool_calls(
    client=openai_client,
    run=run,
    thread=thread,
)

print(response_after_tool_calls)
```

## 🚀 Javascript 快速入门

要在 Javascript 中开始使用 Composio SDK，请按照以下步骤操作：

### 1. **安装 Composio SDK**：
   ```bash
   npm install composio-core
   ```

### 2. **配置 OpenAI 和 Composio 工具集**：
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
           // 如果此实体/用户尚未连接帐户
           const connection = await entity.initiateConnection(appName);
           console.log("通过以下方式登录: ", connection.redirectUrl);
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

### 3. **运行您的脚本**：
   ```bash
   node your_script.js
   ```

这将设置 Composio SDK 并执行一个使用提供的说明创建 GitHub 问题的代理。

有关更多详细信息，请参阅 [Composio SDK 文档](https://docs.composio.dev/)。

## 💡 示例

### [竞争对手研究员](https://docs.composio.dev/guides/examples/CompetitorResearcher)

### [待办事项列表转日历](https://docs.composio.dev/guides/examples/todo-to-calendar) 

### [Github 到 Trello](https://docs.composio.dev/guides/examples/github-trello)

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=composiohq/composio&type=Date)](https://star-history.com/#composiohq/composio&Date)

## 📋 阅读我们的行为准则
  
作为我们开源社区的一部分，我们要求自己和其他贡献者遵守高标准的沟通。作为本项目的参与者和贡献者，您同意遵守我们的[行为准则](https://github.com/composiodev/composio/blob/master/CODE_OF_CONDUCT.md)。

## 🤗 贡献

Composio 是开源的，我们欢迎贡献。请 fork 存储库，为您的功能创建一个新分支，添加您的功能或改进，然后发送拉取请求。

在开始之前，请先阅读我们的[贡献指南](https://github.com/composiodev/composio/blob/master/CONTRIBUTING.md)和[行为准则](https://github.com/composiodev/composio/blob/master/CODE_OF_CONDUCT.md)。

## 🔗 链接

- [主页](https://composio.dev?utm_campaign=github-readme) 
- [贡献指南](https://github.com/composiodev/composio/blob/master/CONTRIBUTING.md)
- [文档](https://docs.composio.dev/?utm_campaign=github-readme)

## 🛡️ 许可证

Composio 采用 Elastic 许可证 - 有关详细信息，请参阅 [LICENSE](https://github.com/composiodev/composio/blob/master/LICENSE) 文件。

## 💪 感谢所有贡献者

<a href="https://composio.dev/contributors?utm_source=github">
  <img src="https://contributors-img.web.app/image?repo=composiodev/composio" alt="贡献者名单"/>
</a>
