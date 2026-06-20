# Node.js Claude Agent SDK E2E

Verifies that `@composio/claude-agent-sdk` works on the current Node.js runtime with the real `@anthropic-ai/claude-agent-sdk` package.

The fixture wraps a deterministic local Composio-style tool, mounts it into an SDK MCP server, and asks Claude to call it.

## Requirements

```bash
ANTHROPIC_API_KEY=...
```

## Run

```bash
pnpm --filter @e2e-tests/node-claude-agent-sdk test:e2e:node
```
