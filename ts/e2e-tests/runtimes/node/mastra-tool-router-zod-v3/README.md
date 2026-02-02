# @composio/mastra + Zod v3 Tool Router Test

Verifies that `@composio/mastra` works correctly with `zod@3.25.76` in a Tool Router workflow.

## Why This Exists

Issue [#2109](https://github.com/ComposioHQ/composio/issues/2109) tracks Mastra integration support. The `@composio/mastra` provider must work with both Zod v3 and v4. This suite ensures:

- MastraProvider integrates correctly with Composio core
- MCP client can connect to Composio's Tool Router endpoint
- Mastra Agent can use Composio tools via MCP
- Structured output with Zod v3 schemas works correctly

## What It Tests

| Test                 | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| Tool Router workflow | Creates session, connects MCP, runs agent with Zod v3 schema |

## Test Setup

This test runs **directly in Bun** (no Docker fixtures). It imports packages from the monorepo workspace and makes real API calls:

```typescript
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { MCPClient } from '@mastra/mcp';
import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
```

**Required environment variables:**

- `COMPOSIO_API_KEY` - Composio API key for Tool Router
- `OPENAI_API_KEY` - OpenAI API key for agent LLM calls

## Isolation Tool

**Docker** with Node.js versions: 22.12.0.

## Running

```bash
pnpm test:e2e
```
