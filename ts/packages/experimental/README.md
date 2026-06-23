# @composio/experimental

Optional adapters for experimental Composio SDK capabilities.

## BYO / Local Workbench

The local workbench lets you run Composio workbench code on your own sandbox provider while keeping inline Composio tool calls available from the sandbox. The SDK provisions the sandbox on the developer machine with the developer's provider key; provider credentials are never sent to Composio.

```ts
import { Composio } from '@composio/core';
import { experimental_createLocalWorkbenchSession } from '@composio/core/experimental';
import { experimental_e2bSandbox } from '@composio/experimental';

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

The provider-agnostic SDK surface lives in `@composio/core/experimental`; this package supplies optional provider adapters. Other sandbox providers can implement `SandboxProvider` with the same `provision`, `exec`, `runBash`, `writeFile`, and `teardown` contract.

```ts
import type { SandboxProvider } from '@composio/core/experimental';

export function mySandboxProvider(): SandboxProvider<MySandboxHandle> {
  return {
    provider: 'my-sandbox',
    async provision(ctx) {
      return startSandbox({
        env: {
          BACKEND_URL: ctx.backendUrl,
          COMPOSIO_API_KEY: ctx.apiKey,
        },
      });
    },
    async exec(handle, code) {
      return handle.runCode(code);
    },
    async runBash(handle, cmd) {
      return handle.runCommand(cmd);
    },
    async writeFile(handle, path, content) {
      await handle.files.write(path, content);
    },
    async teardown(handle) {
      await handle.stop();
    },
  };
}
```

Local workbench v0 covers sandbox provisioning, code execution, file writes, teardown, and TypeScript `runComposioTool` calls through Tool Router `/execute`. It is not yet full remote workbench parity: Python helpers, `invoke_llm`, cloud file persistence, notebook persistence, checkpoints, and server-side workbench lifecycle controls remain follow-ups.

## Status: Experimental — API may change

This package and the `@composio/core/experimental` exports follow the `experimental_` export convention. APIs may change without the same stability guarantees as stable `@composio/core` exports.
