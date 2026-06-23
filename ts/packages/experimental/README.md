# @composio/experimental

Experimental Composio SDK capabilities that are useful before they are stable enough for core.

## BYO / Local Workbench

The local workbench lets you run Composio workbench code on your own sandbox provider while keeping inline Composio tool calls available from the sandbox. The SDK provisions the sandbox on the developer machine with the developer's provider key; provider credentials are never sent to Composio.

```ts
import { Composio } from '@composio/core';
import {
  experimental_createLocalWorkbenchSession,
  experimental_e2bSandbox,
} from '@composio/experimental';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

const workbench = await experimental_createLocalWorkbenchSession(composio, 'user_123', {
  toolkits: ['github'],
  workbench: {
    experimentalProvider: experimental_e2bSandbox({
      apiKey: process.env.E2B_API_KEY,
    }),
  },
});

await workbench.provider.runBash(workbench.sandbox, 'node --version');
await workbench.teardown();
```

The injected helper exposes `runComposioTool(slug, args)` inside the sandbox and authenticates `/execute` calls with the Composio project API key. For v0, use this only with trusted sandboxes you control because the project API key is injected into that runtime. Python helper parity is a follow-up.

## V0 Scope

This is a provider-agnostic SDK surface with E2B as the first adapter. Other sandbox providers can implement `SandboxProvider` with the same `provision`, `exec`, `runBash`, `writeFile`, and `teardown` contract.

Local workbench v0 covers sandbox provisioning, code execution, file writes, teardown, and TypeScript `runComposioTool` calls through Tool Router `/execute`. It is not yet full remote workbench parity: Python helpers, `invoke_llm`, cloud file persistence, notebook persistence, checkpoints, and server-side workbench lifecycle controls remain follow-ups.

## Status: Experimental — API may change

This package follows the `experimental_` export convention. APIs may change without the same stability guarantees as `@composio/core`.
