<p align="center">
  <a href="https://composio.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://brand.composio.dev/logos/Logomark-White.svg">
      <img alt="Composio logo" src="https://brand.composio.dev/logos/Logomark-Black.svg" width="96">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://composio.dev"><b>composio.dev</b></a> •
  <a href="https://docs.composio.dev">Documentation</a> •
  <a href="https://docs.composio.dev/docs/quickstart">Quickstart</a>
</p>

<p align="center">
  <a href="https://github.com/ComposioHQ/composio/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/ComposioHQ/composio?style=social" /></a>
  <a href="https://www.npmjs.com/package/@composio/core"><img alt="npm" src="https://img.shields.io/npm/v/@composio/core?label=%40composio%2Fcore" /></a>
  <a href="https://pypi.org/project/composio/"><img alt="PyPI" src="https://img.shields.io/pypi/v/composio?label=composio" /></a>
  <a href="https://discord.gg/composio"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?logo=discord&logoColor=white" /></a>
  <a href="https://hvtracker.net/agents/composio/"><img alt="HVTrust" src="https://hvtracker.net/badge/composio.svg" /></a>
</p>

# Composio

Composio gives your AI agents 1000+ pre-authenticated toolkits, per-user sessions, authentication, triggers, and a sandbox, so you can ship agents that turn intent into action.

This is the Composio SDK monorepo. It contains:

- **[`@composio/core`](ts/packages/core)**: TypeScript SDK
- **[`composio`](python)**: Python SDK
- **[`@composio/cli`](ts/packages/cli)**: `composio` CLI — search, execute, and script tools from your shell
- **Provider adapters** for OpenAI Agents, Claude Agent SDK, Vercel AI SDK, LangChain, and [more](#providers)

## Quickstart

Create a session for a user, hand its tools to your agent, and let the agent take action across 1000+ apps. Grab a `COMPOSIO_API_KEY` from the [dashboard](https://dashboard.composio.dev/settings) first.

### TypeScript

```bash
npm install @composio/core @composio/openai-agents @openai/agents
```

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

By default a session gets meta tools that discover, authenticate, and execute app tools at runtime, so you don't load hundreds of tool definitions into context. Store `session.session_id` and reuse it with `composio.use()` across turns. See [what a session is](https://docs.composio.dev/docs/how-composio-works) and [configuring sessions](https://docs.composio.dev/docs/configuring-sessions) for restricting toolkits, auth configs, and connected accounts.

**Prefer MCP?** Every session also exposes a hosted MCP endpoint — pass `mcp: true` to `composio.create()` and point Claude, Cursor, or any MCP client at `session.mcp.url`. See [sessions via MCP](https://docs.composio.dev/docs/sessions-via-mcp).

## CLI

The `composio` CLI runs Composio from your shell — and gives coding agents like Claude Code a local tool surface.

```bash
curl -fsSL https://composio.dev/install | bash
composio login
```

Also available via `brew install ComposioHQ/tap/composio` or `npm install -g @composio/cli`. Use `composio search` to find tools, `composio execute` to run them, `composio link` to connect accounts, and `composio run` to script workflows in TypeScript. See the [CLI docs](https://docs.composio.dev/docs/cli).

## Providers

A provider adapts Composio tools to your agent framework's native tool format:

| Provider | TypeScript | Python |
|----------|:----------:|:------:|
| OpenAI | [`@composio/openai`](https://www.npmjs.com/package/@composio/openai) | [`composio-openai`](https://pypi.org/project/composio-openai/) |
| OpenAI Agents | [`@composio/openai-agents`](https://www.npmjs.com/package/@composio/openai-agents) | [`composio-openai-agents`](https://pypi.org/project/composio-openai-agents/) |
| Anthropic | [`@composio/anthropic`](https://www.npmjs.com/package/@composio/anthropic) | [`composio-anthropic`](https://pypi.org/project/composio-anthropic/) |
| Claude Agent SDK | [`@composio/claude-agent-sdk`](https://www.npmjs.com/package/@composio/claude-agent-sdk) | [`composio-claude-agent-sdk`](https://pypi.org/project/composio-claude-agent-sdk/) |
| Vercel AI SDK | [`@composio/vercel`](https://www.npmjs.com/package/@composio/vercel) | — |
| Google GenAI | [`@composio/google`](https://www.npmjs.com/package/@composio/google) | [`composio-gemini`](https://pypi.org/project/composio-gemini/), [`composio-google`](https://pypi.org/project/composio-google/) |
| Google ADK | — | [`composio-google-adk`](https://pypi.org/project/composio-google-adk/) |
| LangChain | [`@composio/langchain`](https://www.npmjs.com/package/@composio/langchain) | [`composio-langchain`](https://pypi.org/project/composio-langchain/) |
| LangGraph | via `@composio/langchain` | [`composio-langgraph`](https://pypi.org/project/composio-langgraph/) |
| LlamaIndex | [`@composio/llamaindex`](https://www.npmjs.com/package/@composio/llamaindex) | [`composio-llamaindex`](https://pypi.org/project/composio-llamaindex/) |
| Mastra | [`@composio/mastra`](https://www.npmjs.com/package/@composio/mastra) | — |
| Pi | [`@composio/experimental`](https://www.npmjs.com/package/@composio/experimental)* | — |
| Cloudflare Workers AI | [`@composio/cloudflare`](https://www.npmjs.com/package/@composio/cloudflare) | — |
| CrewAI | — | [`composio-crewai`](https://pypi.org/project/composio-crewai/) |
| AutoGen | — | [`composio-autogen`](https://pypi.org/project/composio-autogen/) |

\* *The [Pi provider](https://docs.composio.dev/docs/providers/pi) is experimental and ships from `@composio/experimental`.*

Don't see your framework? [Build a custom provider](https://docs.composio.dev/docs/providers/custom-providers), or skip providers entirely and connect over [MCP](https://docs.composio.dev/docs/sessions-via-mcp).

## Repository layout

```text
ts/                TypeScript SDK workspace
  packages/core/       @composio/core
  packages/providers/  Provider adapters
  packages/cli/        Composio CLI
python/            Python SDK and provider packages
docs/              Documentation site (docs.composio.dev)
```

The TypeScript SDK is tested against Node 22+; the Python SDK supports Python 3.10+.

## Development

```bash
mise install    # pinned toolchain (Node, Python, pnpm)
pnpm install
pnpm build
pnpm test
```

Python commands run from `python/` — see [`python/README.md`](python/README.md). We welcome contributions to both SDKs; read the [contribution guidelines](CONTRIBUTING.md) before submitting pull requests.

## Support

- [Documentation](https://docs.composio.dev)
- [Discord community](https://discord.gg/composio)
- [Open an issue](https://github.com/ComposioHQ/composio/issues)
- [support@composio.dev](mailto:support@composio.dev)

## License

MIT — see [LICENSE](LICENSE).
