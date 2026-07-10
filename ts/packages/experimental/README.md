# `@composio/experimental`

Experimental additions to the Composio TypeScript SDK. Features ship here before they are ready for [`@composio/core`](../core), so APIs can change or be removed between releases.

## Installation

```bash
npm install @composio/core @composio/experimental
```

## What's inside

- `PiProvider` (root export): adapts Composio tools for [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent), including dynamic session helpers that let Pi search, connect, and execute tools at runtime. See the [Pi provider docs](https://docs.composio.dev/docs/providers/pi) for the full guide.
- `EveProvider` (from `@composio/experimental/eve`): adapts Composio tools for the [eve](https://github.com/vercel/eve) agent framework, with hook-based interception and per-tool approval helpers.
- `experimental_createLocalWorkbenchSession` (from `@composio/experimental/workbench`): run a session's sandbox on your local machine instead of the hosted workbench.

## Links

- Pi provider docs: https://docs.composio.dev/docs/providers/pi
- Composio docs: https://docs.composio.dev
