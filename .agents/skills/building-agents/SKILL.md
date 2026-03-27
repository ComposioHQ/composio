# Building AI Agents with Composio SDK

This skill provides comprehensive guidance for building AI agents using Composio SDK with various provider frameworks.

## Overview

Composio integrates with 10+ major AI agent frameworks, allowing you to add tools and external integrations to your agents. Each framework-specific skill provides:
- Installing and setting up the provider SDK
- Finding latest SDK versions (NPM/PyPI)
- Official documentation links and latest examples
- Code examples for building agents with Composio tools
- Best practices and troubleshooting tips

## Installing Composio Packages

### Working in Composio SDK Repository (This Workspace)

If you're working within the Composio SDK repository itself, install packages from the workspace:

**TypeScript:**
```bash
pnpm i @composio/core @composio/<provider> --workspace
```

**Example:**
```bash
pnpm i @composio/core @composio/openai --workspace
```

### External Projects (Outside SDK Repository)

For projects outside the Composio SDK repository, install from NPM/PyPI:

**TypeScript:**
```bash
npm install @composio/core @composio/<provider>
```

**Python:**
```bash
pip install composio-<provider>
# or
uv pip install composio-<provider>
```

**Examples:**
```bash
# TypeScript
npm install @composio/core @composio/openai

# Python
pip install composio-openai
```

## Available Framework Skills

Use `/building-agents-using-<framework>` to access specific guides:

### 1. **building-agents-using-openai**
Build agents using OpenAI's Chat Completions API, Assistants API, and Agents API.
- **Languages**: TypeScript, Python
- **Key Features**: Function calling, streaming, parallel tool calls
- **Models**: GPT-4o, GPT-4o-mini, GPT-4 Turbo
- **Use Cases**: General-purpose agents, chatbots, automation

**Invoke:** `/building-agents-using-openai`

### 2. **building-agents-using-anthropic**
Build agents using Anthropic's Codex API and Codex Agent SDK.
- **Languages**: TypeScript, Python
- **Key Features**: Prompt caching, long context, thinking blocks
- **Models**: Codex 3.7 Sonnet, Codex 3.5 Sonnet, Codex 3 Opus
- **Use Cases**: Complex reasoning, code analysis, long documents

**Invoke:** `/building-agents-using-anthropic`

### 3. **building-agents-using-langchain**
Build agents using LangChain and LangGraph for production workflows.
- **Languages**: TypeScript, Python
- **Key Features**: Graph-based agents, middleware, state management
- **Framework**: LangGraph recommended for production
- **Use Cases**: Multi-step workflows, RAG with actions, complex agents

**Invoke:** `/building-agents-using-langchain`

### 4. **building-agents-using-langgraph**
Build stateful, durable agents using LangGraph (v1.0).
- **Languages**: TypeScript, Python
- **Key Features**: Durable execution, human-in-the-loop, persistent memory
- **Status**: Production-ready (v1.0 released late 2025)
- **Use Cases**: Long-running workflows, supervised agents, multi-agent systems

**Invoke:** `/building-agents-using-langgraph`

### 5. **building-agents-using-google**
Build agents using Google's Gemini API and GenAI SDK.
- **Languages**: TypeScript, Python
- **Key Features**: Compositional function calling, parallel execution, thinking
- **Models**: Gemini 3 Flash/Pro, Gemini 2.5 Flash/Pro
- **Use Cases**: Multi-step workflows, location-based services, data analysis

**Invoke:** `/building-agents-using-google`

### 6. **building-agents-using-vercel**
Build agents using Vercel AI SDK for TypeScript/JavaScript applications.
- **Languages**: TypeScript, JavaScript
- **Key Features**: ToolLoopAgent, streaming, multi-provider support (40+)
- **Frameworks**: Next.js, Node.js, React, Vue, Svelte
- **Use Cases**: AI chatbots, web applications, full-stack AI

**Invoke:** `/building-agents-using-vercel`

### 7. **building-agents-using-llamaindex**
Build RAG-enhanced agents using LlamaIndex.
- **Languages**: TypeScript, Python
- **Key Features**: ReAct agents, query engines as tools, workflows
- **Framework**: Workflows 1.0 for complex agentic systems
- **Use Cases**: RAG + actions, documentation bots, code assistants

**Invoke:** `/building-agents-using-llamaindex`

### 8. **building-agents-using-mastra**
Build agents using Mastra, the modern TypeScript framework from the Gatsby team.
- **Languages**: TypeScript
- **Key Features**: Autonomous agents, 40+ model providers, streaming
- **Status**: v1.0 released January 2026
- **Use Cases**: GitHub automation, web search, multi-tool workflows

**Invoke:** `/building-agents-using-mastra`

### 9. **building-agents-using-cloudflare**
Build edge-deployed agents using Cloudflare Workers AI and Agents SDK.
- **Languages**: TypeScript, JavaScript
- **Key Features**: Edge deployment, embedded function calling, Durable Objects
- **Platform**: Cloudflare Workers, Workers AI
- **Use Cases**: Low-latency agents, real-time chat, API orchestration

**Invoke:** `/building-agents-using-cloudflare`

### 10. **building-agents-using-crewai**
Build multi-agent teams using CrewAI for collaborative AI.
- **Languages**: Python
- **Key Features**: Role-based agents, task dependencies, YAML configs
- **Framework**: Lean, fast, independent of LangChain
- **Use Cases**: Research & reporting, content creation, data analysis

**Invoke:** `/building-agents-using-crewai`

### 11. **building-agents-using-autogen**
Build multi-agent conversational systems using Microsoft AutoGen.
- **Languages**: Python
- **Key Features**: Multi-agent chat, AutoGen Studio, event-driven core
- **Status**: Microsoft Agent Framework is the successor
- **Use Cases**: Multi-agent conversations, research, customer support

**Invoke:** `/building-agents-using-autogen`

## Finding Latest SDK Versions

Each skill includes commands to find the latest versions of both Composio packages and provider SDKs.

### Find Latest Composio Package Version

**NPM (TypeScript):**
```bash
npm view @composio/<provider> version
# Example
npm view @composio/openai version
```

**PyPI (Python):**
```bash
pip index versions composio-<provider> | grep "Available versions" | head -1
# Example
pip index versions composio-openai | grep "Available versions" | head -1
```

### Find Latest Provider SDK Version

**NPM (TypeScript):**
```bash
npm view <provider-package> version
# Example
npm view openai version
```

**PyPI (Python):**
```bash
pip index versions <provider-package> | grep "Available versions" | head -1
# Example
pip index versions openai | grep "Available versions" | head -1
```

## Tool Router vs Direct Tools

Composio SDK supports two integration methods based on the provider type:

### 🤖 Agentic Providers (Tool Router ONLY)

These frameworks support full modifier capabilities and **MUST use Tool Router** for user-isolated sessions:

| Framework | Package | Why Tool Router |
|-----------|---------|----------------|
| **Vercel AI SDK** | `@composio/vercel` | Multi-agent support, modifiers |
| **LangChain** | `@composio/langchain` | Complex chains, state management |
| **LangGraph** | `@composio/langchain` | Stateful workflows, durability |
| **Mastra** | `@composio/mastra` | Multi-provider routing |
| **LlamaIndex** | `@composio/llamaindex` | RAG + agents, workflows |
| **Codex Agent SDK** | `@composio/Codex-agent-sdk` | Codex agents framework |
| **OpenAI Agents** | `@composio/openai-agents` | OpenAI Agents API |
| **Cloudflare** | `@composio/cloudflare` | Edge agents, Durable Objects |
| **CrewAI** | Python | Multi-agent teams |
| **AutoGen** | Python | Multi-agent conversations |

**Tool Router Benefits:**
- ✅ **User Isolation**: Each user gets their own tool session
- ✅ **Auto-Authentication**: In-chat OAuth flows
- ✅ **Scoped Access**: Control toolkits per user
- ✅ **Connection Management**: Automatic OAuth handling
- ✅ **Production Ready**: Built for multi-user applications

### 📦 Non-Agentic Providers (Direct Tools)

These providers only support schema modifiers and use **direct tools** approach:

| Framework | Package | Why Direct Tools |
|-----------|---------|-----------------|
| **OpenAI** | `@composio/openai` | Chat Completions, Assistants API |
| **Anthropic** | `@composio/anthropic` | Codex Messages API |
| **Google Gemini** | `@composio/google` | GenAI SDK |

**Direct Tools Characteristics:**
- ✅ Simpler for single-user apps
- ✅ No session management needed
- ⚠️ Not suitable for multi-user production apps
- ⚠️ Manual authentication required

### Tool Router Quick Start

```typescript
import { Composio } from '@composio/core';
import { OpenAI } from 'openai';

const composio = new Composio();
const openai = new OpenAI();

async function runAgent(userId: string, prompt: string) {
  // Create isolated session for user
  const session = await composio.create(userId, {
    toolkits: ['github'],
    manageConnections: true  // Enable auto-authentication
  });

  // Get tools from session
  const tools = await session.tools();

  // Use with OpenAI
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    tools: tools,
  });

  // Handle tool calls
  if (response.choices[0].message.tool_calls) {
    const result = await composio.provider.handleToolCalls(userId, response);
    return result;
  }
}

// Each user gets isolated tools
await runAgent('user_123', 'Create a GitHub issue');
await runAgent('user_456', 'Check my Gmail');  // Different user, different session
```

### Tool Router with Framework Integration

Each framework skill includes Tool Router examples. See:
- `/building-agents-using-openai` - Tool Router with OpenAI
- `/building-agents-using-anthropic` - Tool Router with Codex
- `/building-agents-using-vercel` - Tool Router with Vercel AI SDK
- And all other framework skills

### Learn More About Tool Router

For comprehensive Tool Router documentation, use:
```bash
/composio-tool-router
```

## Quick Start Example

Here's a quick example using OpenAI with direct tools (single-user):

### TypeScript

```typescript
import { Composio } from '@composio/core';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

// Get tools
const tools = await composio.tools.get('default', { toolkits: ['github'] });

// Use with OpenAI
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Create a GitHub issue' }],
  tools: tools,
});

// Handle tool calls
if (response.choices[0].message.tool_calls) {
  const result = await composio.provider.handleToolCalls('default', response);
  console.log(result);
}
```

### Python

```python
from composio_openai import ComposioToolSet, Action
from openai import OpenAI

openai_client = OpenAI(api_key="YOUR_OPENAI_KEY")
composio_toolset = ComposioToolSet(api_key="YOUR_COMPOSIO_KEY")

# Get tools
tools = composio_toolset.get_tools(actions=[Action.GITHUB_CREATE_ISSUE])

# Use with OpenAI
response = openai_client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Create a GitHub issue"}],
    tools=tools,
)

# Handle tool calls
result = composio_toolset.handle_tool_calls(response)
```

## Provider Comparison

| Provider | Languages | Best For | Complexity | Maturity |
|----------|-----------|----------|------------|----------|
| OpenAI | TS, Py | General purpose, function calling | Low | Mature |
| Anthropic | TS, Py | Complex reasoning, long context | Low | Mature |
| LangChain | TS, Py | Prototyping multi-agent workflows | Medium | Mature |
| LangGraph | TS, Py | Production stateful agents | High | Mature (v1.0) |
| Google Gemini | TS, Py | Compositional function calling | Low | Mature |
| Vercel AI SDK | TS | Full-stack web applications | Low | Mature (v6.0) |
| LlamaIndex | TS, Py | RAG + agents | Medium | Mature |
| Mastra | TS | Modern TypeScript apps | Low | New (v1.0 2026) |
| Cloudflare | TS | Edge-deployed agents | Medium | Growing |
| CrewAI | Py | Multi-agent teams | Medium | Mature |
| AutoGen | Py | Research multi-agent systems | High | Mature |

## Common Composio Features

All frameworks support these Composio features:

### 1. Tool Management
```typescript
// Get tools by app
const tools = await composio.tools.get('default', { apps: ['github', 'slack'] });

// Get specific actions
const tools = await composio.tools.get('default', { actions: ['GITHUB_CREATE_ISSUE'] });

// Get by toolkit
const tools = await composio.tools.get('default', { toolkits: ['github'] });
```

### 2. Connected Accounts
```typescript
// Manage user integrations
const account = await composio.connectedAccounts.initiate({
  integrationId: 'github',
  entityId: 'user-123',
});
```

### 3. Custom Tools
```typescript
// Create custom tools
const customTool = await composio.tools.createCustomTool({
  name: 'My Tool',
  description: 'Tool description',
  execute: async (input) => {
    // Implementation
    return { data: 'result' };
  },
});
```

## Environment Variables

Most examples require:

```bash
# Composio
COMPOSIO_API_KEY=...

# LLM Provider (choose one or more)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

## Documentation Resources

- **Composio Docs**: https://docs.composio.dev/
- **Composio GitHub**: https://github.com/composiohq/composio-sdk
- **API Reference**: https://docs.composio.dev/api-reference
- **Examples**: Check `ts/examples/` and `python/examples/` in this repository

## Getting Help

- **Discord**: https://discord.gg/composio
- **GitHub Issues**: https://github.com/composiohq/composio-sdk/issues
- **Documentation**: https://docs.composio.dev/

## Next Steps

1. Choose a framework from the list above
2. Invoke the corresponding skill (e.g., `/building-agents-using-openai`)
3. Follow the installation and setup instructions
4. Try the code examples
5. Build your agent!

## Tips

- **Start simple** - Begin with OpenAI or Anthropic for easiest setup
- **Use LangGraph** for production stateful agents
- **Try Vercel AI SDK** for full-stack web applications
- **Use CrewAI** for multi-agent collaborative systems
- **Check examples** in the repository for working code
- **Read framework docs** linked in each skill for advanced features
