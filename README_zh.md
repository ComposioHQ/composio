<p align="center">
  <a href="https://composio.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://brand.composio.dev/logos/Logomark-White.svg">
      <img alt="Composio logo" src="https://brand.composio.dev/logos/Logomark-Black.svg" width="96">
    </picture>
  </a>
</p>

> 本文件是 [README.md](README.md) 的简体中文翻译。代码、命令、包名、链接与表格中的路径保持原文；专有名词（Composio、SDK、provider、session、CLI、MCP 等）保留英文。

<p align="center">
  <a href="https://composio.dev"><b>composio.dev</b></a> •
  <a href="https://docs.composio.dev">Documentation</a> •
  <a href="https://docs.composio.dev/docs/quickstart">Quickstart</a> •
  <a href="https://docs.composio.dev/reference/changelog">Changelog</a>
</p>

<p align="center">
  <a href="https://github.com/ComposioHQ/composio/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/ComposioHQ/composio?style=social" /></a>
  <a href="https://www.npmjs.com/package/@composio/core"><img alt="npm" src="https://img.shields.io/npm/v/@composio/core?label=%40composio%2Fcore" /></a>
  <a href="https://pypi.org/project/composio/"><img alt="PyPI" src="https://img.shields.io/pypi/v/composio?label=composio" /></a>
  <a href="https://discord.gg/composio"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?logo=discord&logoColor=white" /></a>
  <a href="https://hvtracker.net/agents/composio/"><img alt="HVTrust" src="https://hvtracker.net/badge/composio.svg" /></a>
</p>

# Composio

Composio 为你的 AI agent 提供 1000+ 个预先完成鉴权的工具包（toolkit）、按用户隔离的会话（session）、鉴权、触发器（trigger）以及一个沙箱（sandbox），让你能够交付可将意图转化为行动的 agent。

这里是 Composio SDK 的 monorepo，包含：

- **[`@composio/core`](ts/packages/core)**：TypeScript SDK
- **[`composio`](python)**：Python SDK
- **[`composio` CLI](ts/packages/cli)**：在你的 shell 中搜索、执行并用脚本编排工具
- 面向 OpenAI Agents、Claude Agent SDK、Vercel AI SDK、LangChain 等的 **provider 适配器**，以及[更多](#providers)

## 快速上手（Quickstart）

先为某个用户创建一个会话，把它的工具交给你的 agent，让 agent 在 1000+ 个应用中采取行动。请先从 [dashboard](https://dashboard.composio.dev/settings) 获取一个 `COMPOSIO_API_KEY`。

### TypeScript

```bash
npm install @composio/core @composio/openai-agents @openai/agents
```

> `@composio/core` 有意随包分发其 TypeScript 源码与 SDK 文档，使已安装的包对 coding agent 可被检查。如果你想要一个体积更小、API 相同的安装，请使用 [`@composio/slim`](ts/packages/slim)。

```typescript
import { Composio } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { Agent, run } from "@openai/agents";

const composio = new Composio({ provider: new OpenAIAgentsProvider() });

// Each session is scoped to one of your users
const session = await composio.create("user_123");
const tools = await session.tools();

const agent = new Agent({
  name: "Personal Assistant",
  instructions: "You are a helpful assistant. Use Composio tools to take action.",
  tools,
});

const result = await run(agent, "Summarize my emails from today");
console.log(result.finalOutput);
```

### Python

```bash
pip install composio composio-openai-agents openai-agents
```

```python
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
from agents import Agent, Runner

composio = Composio(provider=OpenAIAgentsProvider())

# Each session is scoped to one of your users
session = composio.create(user_id="user_123")
tools = session.tools()

agent = Agent(
    name="Personal Assistant",
    instructions="You are a helpful assistant. Use Composio tools to take action.",
    tools=tools,
)

result = Runner.run_sync(starting_agent=agent, input="Summarize my emails from today")
print(result.final_output)
```

默认情况下，会话会获得一组元工具（meta tools），可在运行时发现、鉴权并执行各应用的工具，这样你就不必把数百个工具定义加载进上下文。保存 `session.session_id`，并在多轮对话中通过 `composio.use()` 复用它。关于限定工具包、鉴权配置与已连接账户，请参见 [what a session is](https://docs.composio.dev/docs/how-composio-works) 与 [configuring sessions](https://docs.composio.dev/docs/configuring-sessions)。

**更偏好 MCP？** 每个会话还会暴露一个托管的 MCP 端点。向 `composio.create()` 传入 `mcp: true`，并把 Claude、Cursor 或任意 MCP 客户端指向 `session.mcp.url`。参见 [sessions via MCP](https://docs.composio.dev/docs/sessions-via-mcp)。

## CLI

`composio` CLI 让你在 shell 中运行 Composio，并为 Claude Code 这类 coding agent 提供一个本地的工具接口。

```bash
curl -fsSL https://composio.dev/install | sh
```

安装器会把 `composio` 加入你后续终端的 `PATH`。请新开一个终端，然后运行 `composio login`。关于 shell 设置的覆盖项（包括用于仅安装、不修改 shell 的 `COMPOSIO_INSTALL_SHELL=none`），参见 [INSTALL.md](INSTALL.md)。

使用 `composio search` 查找工具，`composio execute` 运行工具，`composio link` 连接账户，`composio run` 用 TypeScript 编排工作流。参见 [CLI 文档](https://docs.composio.dev/docs/cli)。

<a name="providers"></a>

## Provider 适配（Providers）

provider 会把 Composio 工具适配为你的 agent 框架原生的工具格式：

| Provider | TypeScript | Python |
|----------|:----------:|:------:|
| OpenAI | [`@composio/openai`](ts/packages/providers/openai) | [`composio-openai`](python/providers/openai) |
| OpenAI Agents | [`@composio/openai-agents`](ts/packages/providers/openai-agents) | [`composio-openai-agents`](python/providers/openai_agents) |
| Anthropic | [`@composio/anthropic`](ts/packages/providers/anthropic) | [`composio-anthropic`](python/providers/anthropic) |
| Claude Agent SDK | [`@composio/claude-agent-sdk`](ts/packages/providers/claude-agent-sdk) | [`composio-claude-agent-sdk`](python/providers/claude_agent_sdk) |
| Vercel AI SDK | [`@composio/vercel`](ts/packages/providers/vercel) | — |
| Google GenAI | [`@composio/google`](ts/packages/providers/google) | [`composio-gemini`](python/providers/gemini)、[`composio-google`](python/providers/google) |
| Google ADK | — | [`composio-google-adk`](python/providers/google_adk) |
| LangChain | [`@composio/langchain`](ts/packages/providers/langchain) | [`composio-langchain`](python/providers/langchain) |
| LangGraph | 经由 `@composio/langchain` | [`composio-langgraph`](python/providers/langgraph) |
| LlamaIndex | [`@composio/llamaindex`](ts/packages/providers/llamaindex) | [`composio-llamaindex`](python/providers/llamaindex) |
| Mastra | [`@composio/mastra`](ts/packages/providers/mastra) | — |
| Pi | [`@composio/experimental`](ts/packages/experimental)* | — |
| Cloudflare Workers AI | [`@composio/cloudflare`](ts/packages/providers/cloudflare) | — |
| TypeSafe (Jev) | [`@composio/typesafe`](ts/packages/providers/typesafe) | [`composio-typesafe`](python/providers/typesafe) |
| CrewAI | — | [`composio-crewai`](python/providers/crewai) |
| AutoGen | — | [`composio-autogen`](python/providers/autogen) |

\* *[Pi provider](https://docs.composio.dev/docs/providers/pi) 仍处于实验阶段，随 `@composio/experimental` 一同发布。*

没看到你使用的框架？[构建一个自定义 provider](https://docs.composio.dev/docs/providers/custom-providers)，或完全跳过 provider，改通过 [MCP](https://docs.composio.dev/docs/sessions-via-mcp) 连接。

## 所有软件包

本仓库发布的全部内容：

| 软件包 | 说明 |
|---------|-------------|
| [`@composio/core`](ts/packages/core) | TypeScript SDK |
| [`@composio/slim`](ts/packages/slim) | 不含随包分发源码与文档的 `@composio/core`；API 相同、体积更小 |
| [`composio` CLI](ts/packages/cli) | 独立 CLI 二进制：`curl -fsSL https://composio.dev/install \| sh` |
| [`@composio/experimental`](ts/packages/experimental) | 实验性集成，包含 Pi provider |
| [`@composio/json-schema-to-zod`](ts/packages/json-schema-to-zod) | JSON Schema 到 Zod 的转换 |
| `@composio/*` [provider 适配器](#providers) | OpenAI、OpenAI Agents、Anthropic、Claude Agent SDK、Vercel、Google、LangChain、LlamaIndex、Mastra、Cloudflare、TypeSafe |
| [`composio`](python) | Python SDK |
| `composio-*` [provider 适配器](#providers) | OpenAI、OpenAI Agents、Anthropic、Claude Agent SDK、Gemini、Google、Google ADK、LangChain、LangGraph、LlamaIndex、CrewAI、AutoGen、TypeSafe |

## 仓库结构

```text
ts/                TypeScript SDK workspace
  packages/core/       @composio/core
  packages/providers/  Provider adapters
  packages/cli/        Composio CLI
python/            Python SDK and provider packages
docs/              Documentation site (docs.composio.dev)
```

TypeScript SDK 针对 Node 22+ 进行测试；Python SDK 支持 Python 3.10+。

## 开发

```bash
mise install    # pinned toolchain (Node, Python, pnpm)
pnpm install
pnpm build
pnpm test
```

Python 命令需在 `python/` 目录下运行；参见 [`python/README.md`](python/README.md)。我们欢迎为这两个 SDK 做出贡献；在提交 pull request 前请阅读 [贡献指南](CONTRIBUTING.md)。

## 支持

- [文档](https://docs.composio.dev)
- [Discord 社区](https://discord.gg/composio)
- [提交 issue](https://github.com/ComposioHQ/composio/issues)
- [support@composio.dev](mailto:support@composio.dev)

## 许可证

MIT。参见 [LICENSE](LICENSE)。
