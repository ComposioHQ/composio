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

## Status: Experimental — API may change

This package follows the `experimental_` export convention. APIs may change without the same stability guarantees as `@composio/core`.
