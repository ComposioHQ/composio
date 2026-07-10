# `@composio/experimental`

Experimental Composio integrations and helpers.

This package currently ships the Pi provider for [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). It wraps Composio tools as Pi `customTools` and provides a dynamic session toolset that lets Pi search, connect, and execute Composio tools at runtime. See the [Pi provider docs](https://docs.composio.dev/docs/providers/pi) for the full guide.

## Install

```bash
npm install @composio/core @composio/experimental @earendil-works/pi-coding-agent
```

## Static tool wrapping

Use this when you already know the exact Composio tools to expose to Pi. Create a session with the direct tools preset so `session.tools()` returns the concrete tools, wrapped for Pi by `PiProvider`.

```ts
import { Composio, SessionPreset } from '@composio/core';
import { PiProvider } from '@composio/experimental';
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new PiProvider(),
});

const composioSession = await composio.sessions.create('user_123', {
  toolkits: ['github'],
  tools: { github: { enable: ['GITHUB_CREATE_ISSUE'] } },
  sessionPreset: SessionPreset.DIRECT_TOOLS,
});

const tools = await composioSession.tools();

const { session } = await createAgentSession({
  cwd: process.cwd(),
  sessionManager: SessionManager.inMemory(process.cwd()),
  customTools: tools,
  tools: ['read', 'bash', ...tools.map(tool => tool.name)],
});

await session.prompt('Create a GitHub issue for the failing test.');
```

## Dynamic session helpers

Use this when Pi should search and execute tools dynamically inside one Composio session. Prefer the capability form so your app owns connection management and uses one Pi-style `hooks` object for interception and result transforms.

```ts
import { Composio } from '@composio/core';
import { PiProvider, createPiComposioSystemPrompt } from '@composio/experimental';
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from '@earendil-works/pi-coding-agent';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new PiProvider(),
});

const composioSession = await composio.sessions.create('user_123', {
  toolkits: ['github', 'gmail'],
  manageConnections: {
    enable: true,
    callbackUrl: 'https://your-app.example.com/auth/callback',
  },
  sandbox: { enable: true },
});

const composioTools = composio.provider.createSessionTools({
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
    remoteBash: (ctx, next) => {
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

`composio_manage_connections` uses your `connections.getToolkitStates()` and `connections.authorizeToolkit()` handlers. It does not call `session.execute('COMPOSIO_MANAGE_CONNECTIONS', ...)` internally.

The dynamic helpers are:

- `composio_search_tools`: search the session for exact tool slugs and schemas.
- `composio_manage_connections`: check and initiate user app connections.
- `composio_execute_tool`: execute exact Composio tool slugs in the session.
- `composio_remote_workbench`: execute Python in the Composio sandbox for large outputs, remote files, and session-authenticated scripting.
- `composio_remote_bash`: run short bash commands in the sandbox filesystem.

The workbench helpers require `includeWorkbenchTools: true` and a session created with the sandbox enabled. Rename any helper through the `names` option; the defaults live on `PI_COMPOSIO_SESSION_TOOL_NAMES`.

## Hooks

`hooks` follows Pi's extension-event style with middleware semantics. Each hook receives a mutable `ctx.request`, `ctx.deny('reason')`, and a typed `next()` function. Calling `await next()` runs the default Composio behavior and returns the result before anything is sent back to the model. Return that result to pass it through, return a replacement value to control what the model sees, or skip `next()` entirely to divert or deny the operation.

Available hooks:

- `search(ctx, next)`: rewrite query/toolkit filters, log search results, or return custom search output.
- `manageConnections(ctx, next)`: rewrite requested toolkits, force reauth, log connection state, or return custom connection output.
- `execute(ctx, next)`: block or rewrite tools, route to another session/execute handler, call `ctx.manageConnections(...)`, log outputs, or return a file/workbench reference instead of inline data.
- `remoteWorkbench(ctx, next)`: rewrite Python code or session metadata, audit workbench runs, or replace large outputs. Calls through the generic `execute` hook when `next()` is used.
- `remoteBash(ctx, next)`: rewrite or block shell commands, enforce safety policy, audit filesystem access, or replace output. Calls through the generic `execute` hook when `next()` is used.
- `onAuthLink(ctx, next)`: send, redact, or resume auth links out-of-band. `return next()` keeps the original model-visible result; returning another value replaces it.

`ctx.deny` is also exported as `denyPiToolCall(reason)`.

## Auth link handling

Embedded agents often need to keep Composio connection URLs out of the public transcript. Use `hooks.onAuthLink()` to choose whether the model sees the original result or a redacted replacement:

```ts
const tools = composio.provider.createSessionTools({
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

## Local workbench

The `@composio/experimental/workbench` entry point exports `experimental_createLocalWorkbenchSession`, which runs a session's workbench Python helpers locally instead of in the remote sandbox. It requires a session created with `sandbox: { enable: false }`; the remote sandbox and a local one cannot both run for one session.

## Status

Experimental. The dynamic helper names and session helper API may change.
