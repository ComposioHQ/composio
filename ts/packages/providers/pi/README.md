# `@composio/pi`

Experimental Composio provider for [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

This package lets Composio tools be passed to Pi SDK sessions as `customTools`. It also includes a dynamic Tool Router session toolset modeled after the Slack bot integration in `~/composio/slack-bot`.

## Install

```bash
pnpm add @composio/core @composio/pi @earendil-works/pi-coding-agent
```

## Static tool wrapping

Use this when you already know the exact Composio tools to expose to Pi.

```ts
import { Composio } from '@composio/core';
import { PiProvider } from '@composio/pi';
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';

const provider = new PiProvider();
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider,
});

const tools = await composio.tools.get('default', {
  tools: ['GITHUB_CREATE_ISSUE'],
});

const { session } = await createAgentSession({
  cwd: process.cwd(),
  sessionManager: SessionManager.inMemory(process.cwd()),
  customTools: tools,
  tools: ['read', 'bash', ...tools.map(tool => tool.name)],
});

await session.prompt('Create a GitHub issue for the failing test.');
```

## Dynamic session helpers

Use this when Pi should search and execute tools dynamically inside one Tool Router session.

```ts
import { Composio } from '@composio/core';
import { PiProvider, createPiComposioSystemPrompt } from '@composio/pi';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from '@earendil-works/pi-coding-agent';

const provider = new PiProvider();
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

const composioSession = await composio.sessions.create('user-123', {
  toolkits: ['github', 'gmail'],
  manageConnections: true,
  workbench: { enable: false },
});

const composioTools = provider.createSessionTools(composioSession, {
  callbackUrl: 'https://your-app.example.com/auth/callback',
  transformResult: async ({ value }) => {
    // Redact or route auth links here if embedding Pi in Slack/Discord/etc.
    return value;
  },
});

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  systemPromptOverride: () => createPiComposioSystemPrompt(composioSession.sessionId),
});
await loader.reload();

const { session } = await createAgentSession({
  cwd: process.cwd(),
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(process.cwd()),
  customTools: composioTools,
  tools: [
    'read',
    'bash',
    'composio_search_tools',
    'composio_manage_connections',
    'composio_execute_tool',
  ],
});

await session.prompt('Find my recent GitHub issues and summarize the blockers.');
```

The dynamic helpers are:

- `composio_search_tools` — search Tool Router for exact tool slugs and schemas.
- `composio_manage_connections` — check/initiate user app connections.
- `composio_execute_tool` — execute exact Composio tool slugs in the session.

## Auth link handling

Embedded agents often need to keep Composio connection URLs out of the public transcript. Use `transformResult` to detect and route links:

```ts
import { extractComposioConnectLinks } from '@composio/pi';

const tools = provider.createSessionTools(composioSession, {
  transformResult: async ({ value }) => {
    const links = extractComposioConnectLinks(value);
    if (links.length > 0) {
      // DM the user or store links out-of-band.
      return { message: 'Connection link sent out-of-band.' };
    }
    return value;
  },
});
```

## Status

Experimental. The dynamic helper names and session helper API may change.
