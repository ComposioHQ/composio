# Composio TypeScript providers

Each package in this directory adapts Composio tools to one agent framework's native tool format. You pass a provider to `new Composio({ provider })`, and `session.tools()` returns tools your framework can call directly.

## Packages

| Package | Framework |
|---------|-----------|
| [`@composio/openai`](openai) | OpenAI Chat Completions and Responses APIs |
| [`@composio/openai-agents`](openai-agents) | OpenAI Agents SDK |
| [`@composio/anthropic`](anthropic) | Anthropic Messages API |
| [`@composio/claude-agent-sdk`](claude-agent-sdk) | Claude Agent SDK |
| [`@composio/vercel`](vercel) | Vercel AI SDK |
| [`@composio/google`](google) | Google GenAI |
| [`@composio/langchain`](langchain) | LangChain and LangGraph |
| [`@composio/llamaindex`](llamaindex) | LlamaIndex |
| [`@composio/mastra`](mastra) | Mastra |
| [`@composio/cloudflare`](cloudflare) | Cloudflare Workers AI |

Each package README has an install command and a runnable quickstart.

## Provider types

Providers extend one of two base classes from `@composio/core`:

- **Non-agentic** (`BaseNonAgenticProvider`): format tool schemas for a raw model API (OpenAI, Anthropic, Cloudflare). Your code runs the tool loop, calling helpers like `executeToolCall` or `handleToolCalls` on the provider.
- **Agentic** (`BaseAgenticProvider`): wrap tools with an execute function baked in (LangChain, LlamaIndex, Mastra, Vercel, OpenAI Agents). The framework runs the tool loop itself.

## Creating a new provider

Scaffold a package from the repository root:

```bash
pnpm create:provider <provider-name> [--agentic]
```

This creates `ts/packages/providers/<provider-name>` with `src/index.ts`, `package.json`, and build config. Implement `wrapTool` and `wrapTools` (plus `executeToolCall` for non-agentic providers), then add tests covering wrapping and execution handling.

If you are building an adapter outside this repo, see the [custom providers guide](https://docs.composio.dev/docs/providers/custom-providers).

## Links

- [Provider docs](https://docs.composio.dev/docs/providers)
- [Composio documentation](https://docs.composio.dev)
