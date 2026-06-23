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

Use this when Pi should search and execute tools dynamically inside one Tool Router session. Prefer the capability form so your app owns connection management and uses one Pi-style `hooks` object for interception/result transforms.

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
  hooks: {
    search: (ctx, next) => {
      ctx.request.toolkits = ctx.request.toolkits?.map(toolkit =>
        toolkit === 'slack' ? 'slackbot' : toolkit
      );
      return next();
    },
    execute: (ctx, next) => {
      if (ctx.request.toolSlug === 'COMPOSIO_MANAGE_CONNECTIONS') {
        return ctx.deny('Meta tools are blocked.');
      }
      return next();
    },
    remoteWorkbench: async (ctx, next) => {
      const result = await next();
      await auditWorkbenchRun({ code: ctx.request.code_to_execute, result });
      return result;
    },
    remoteBash: async (ctx, next) => {
      if (ctx.request.command.includes('rm -rf')) {
        return ctx.deny('Destructive bash commands are blocked.');
      }
      return next();
    },
    onAuthLink: async (ctx, next) => {
      // DM the user, store the continuation, or redact public output.
      await sendConnectionLinkToUser({ url: ctx.url, toolkit: ctx.toolkit });
      return { message: 'Connection link sent out-of-band.' };
      // To also send the original result/link to the model, use: return next();
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

## Hooks

`hooks` follows Pi's extension-event style with middleware semantics. Each hook receives a mutable `ctx.request`, `ctx.deny('reason')`, and a typed `next()` function. Calling `await next()` runs the default Composio behavior and returns the result before anything is sent back to the model. Return that result to pass it through, return a replacement value to control what the model sees, or skip `next()` entirely to divert/deny the operation.

Available hooks:

- `search(ctx, next)` — rewrite query/toolkit filters, log search results, or return custom search output.
- `manageConnections(ctx, next)` — rewrite requested toolkits, force reauth, log connection state, or return custom connection output.
- `execute(ctx, next)` — block/rewrite tools, route to another session/execute handler, call `ctx.manageConnections(...)`, log outputs, or return a file/workbench reference instead of inline data.
- `remoteWorkbench(ctx, next)` — rewrite Python code/session metadata, audit workbench runs, or replace large outputs with file/workbench references. Calls through the generic `execute` hook when `next()` is used.
- `remoteBash(ctx, next)` — rewrite/block shell commands, enforce safety policy, audit filesystem access, or replace output. Calls through the generic `execute` hook when `next()` is used.
- `onAuthLink(ctx, next)` — send/redact/resume auth links out-of-band. `return next()` keeps the original model-visible result; returning another value replaces it.

## Auth link handling

Embedded agents often need to keep Composio connection URLs out of the public transcript. Use `hooks.onAuthLink()` to choose whether the model sees the original result or a redacted replacement:

```ts
const tools = provider.createSessionTools({
  search: composioSession.search.bind(composioSession),
  execute: composioSession.execute.bind(composioSession),
  connections: {
    getToolkitStates: toolkits => composioSession.toolkits({ toolkits }),
    authorizeToolkit: (toolkit, options) => composioSession.authorize(toolkit, options),
  },
  hooks: {
    onAuthLink: async (ctx, next) => {
      await sendConnectionLinkToUser({ url: ctx.url, toolkit: ctx.toolkit });

      if (shouldAlsoShowLinkToModel(ctx)) {
        return next();
      }

      return { message: 'Connection link sent out-of-band.' };
    },
  },
});
```

## Status

Experimental. The dynamic helper names and session helper API may change.
