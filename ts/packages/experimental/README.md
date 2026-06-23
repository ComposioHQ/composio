# `@composio/experimental`

Experimental Composio integrations and helpers.

This package currently includes a Pi provider for [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). It lets Composio tools be passed to Pi SDK sessions as `customTools` and includes a dynamic Tool Router session toolset modeled after the Slack bot integration in `~/composio/slack-bot`.

## Install

```bash
pnpm add @composio/core @composio/experimental @earendil-works/pi-coding-agent
```

## Static tool wrapping

Use this when you already know the exact Composio tools to expose to Pi.

```ts
import { Composio } from '@composio/core';
import { PiProvider } from '@composio/experimental';
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

Use this when Pi should search and execute tools dynamically inside one Tool Router session. Prefer the capability form so your app owns connection management, auth-link routing, and execute policy.

```ts
import { Composio } from '@composio/core';
import { PiProvider, createPiComposioSystemPrompt } from '@composio/experimental';
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from '@earendil-works/pi-coding-agent';

const provider = new PiProvider();
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

const composioSession = await composio.sessions.create('slack:T123:U456', {
  toolkits: ['github', 'gmail'],
  manageConnections: true,
  workbench: { enable: true },
});

const composioTools = provider.createSessionTools({
  sessionId: composioSession.sessionId,
  search: composioSession.search.bind(composioSession),
  execute: composioSession.execute.bind(composioSession),
  callbackUrl: 'https://your-app.example.com/auth/callback',
  includeWorkbenchTools: true,
  connections: {
    getToolkitStates: toolkits => composioSession.toolkits({ toolkits }),
    authorizeToolkit: (toolkit, options) => composioSession.authorize(toolkit, options),
    isConnected: state => state.connection?.isActive === true,
  },
  policy: {
    beforeSearch: ({ toolkits }) => ({
      action: 'search',
      toolkits: toolkits?.map(toolkit => (toolkit === 'slack' ? 'slackbot' : toolkit)),
    }),
    beforeExecute: ({ toolSlug, args }) => {
      if (toolSlug.startsWith('COMPOSIO_')) {
        return { action: 'deny', result: { successful: false, error: 'Meta tools are blocked.' } };
      }
      return { action: 'execute', toolSlug, args };
    },
  },
  authLinks: {
    handle: async ({ url, toolkit }) => {
      // DM the user, store the continuation, or redact public output.
      await sendConnectionLinkToUser({ url, toolkit });
    },
  },
  transformResult: async ({ value }) => value,
});

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  systemPromptOverride: () =>
    createPiComposioSystemPrompt(composioSession.sessionId, { includeWorkbenchTools: true }),
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
    'composio_remote_workbench',
    'composio_remote_bash',
  ],
});

await session.prompt('Find my recent GitHub issues and summarize the blockers.');
```

`composio_manage_connections` uses your `connections.getToolkitStates()` and `connections.authorizeToolkit()` handlers. It does **not** call `session.execute('COMPOSIO_MANAGE_CONNECTIONS', ...)` internally.

The dynamic helpers are:

- `composio_search_tools` — search Tool Router for exact tool slugs and schemas.
- `composio_manage_connections` — check/initiate user app connections.
- `composio_execute_tool` — execute exact Composio tool slugs in the session.
- `composio_remote_workbench` — execute Python in the Composio remote workbench for large outputs, remote files, and session-authenticated scripting.
- `composio_remote_bash` — run short bash commands in the Composio remote workbench filesystem.

Workbench helpers are opt-in because the Tool Router session must be created with workbench enabled.

## Auth link handling

Embedded agents often need to keep Composio connection URLs out of the public transcript. Use the first-class `authLinks.handle()` hook for side effects and `transformResult` for redaction:

```ts
import { extractComposioConnectLinks } from '@composio/experimental';

const tools = provider.createSessionTools({
  search: composioSession.search.bind(composioSession),
  execute: composioSession.execute.bind(composioSession),
  connections: {
    getToolkitStates: toolkits => composioSession.toolkits({ toolkits }),
    authorizeToolkit: (toolkit, options) => composioSession.authorize(toolkit, options),
  },
  authLinks: {
    handle: async ({ url, toolkit }) => {
      await sendConnectionLinkToUser({ url, toolkit });
    },
  },
  transformResult: async ({ value }) => {
    if (extractComposioConnectLinks(value).length > 0) {
      return { message: 'Connection link sent out-of-band.' };
    }
    return value;
  },
});
```

## Status

Experimental. The dynamic helper names and session helper API may change.
