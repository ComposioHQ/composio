# @composio/mastra + Zod v4 Tool Router Test

Verifies that `@composio/mastra` works correctly with `zod@4` in a Tool Router workflow.

## Why This Exists

Issue [#2109](https://github.com/ComposioHQ/composio/issues/2109) tracks Mastra integration support. The `@composio/mastra` provider must work with both Zod v3 and v4. This suite ensures:

- MastraProvider integrates correctly with Composio core
- MCP client can connect to Composio's Tool Router endpoint
- Mastra Agent can use Composio tools via MCP
- Structured output with Zod v4 schemas works correctly

## What It Tests

| Test                 | Description                                              |
| -------------------- | -------------------------------------------------------- |
| Tool Router workflow | Creates session, connects MCP, runs agent with Zod v4 schema |

## Running

```bash
pnpm test:e2e
```
