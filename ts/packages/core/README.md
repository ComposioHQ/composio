# @composio/core

The Composio SDK for TypeScript. Create a session for one of your users, hand its tools to your agent, and let the agent take action across 1000+ apps with authentication handled for you.

Full documentation lives at [docs.composio.dev](https://docs.composio.dev). This package intentionally ships its TypeScript source and SDK docs so the installed package is inspectable by coding agents; if you want a smaller install with the same API, use [`@composio/slim`](https://www.npmjs.com/package/@composio/slim).

## Installation

You need **Node.js 22.22.3 or newer**. The SDK is **ESM-only**: use `import` rather than CommonJS `require()`, and set `"type": "module"` in your project's `package.json`. See the [SDK quickstart](https://docs.composio.dev/docs/quickstart) for framework setup.

```bash
npm install @composio/core
```

## Quickstart

Grab a `COMPOSIO_API_KEY` from the [dashboard](https://dashboard.composio.dev/settings), then create a session:

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

// Each session is scoped to one of your users
const session = await composio.create('user_123');
const tools = await session.tools();
```

By default a session gives your agent a small set of meta tools that discover, authenticate, and execute app tools at runtime, so you never load hundreds of tool definitions into context. Without a provider configured, `session.tools()` returns OpenAI function-calling format.

Sessions persist on the server. For multi-turn conversations, store `session.sessionId` and reuse it instead of calling `create()` again:

```typescript
const session = await composio.use(sessionId);
```

See [what a session is](https://docs.composio.dev/docs/how-composio-works) and [configuring sessions](https://docs.composio.dev/docs/configuring-sessions) for restricting toolkits, auth configs, and connected accounts.

## Inspect sessions without credentials

Import session types from `@composio/core` without constructing a client:

```typescript
import type {
  Composio,
  ToolRouterCreateSessionConfig,
  ToolRouterSessionConfig,
  ToolRouterSessionExecuteResponse,
  ToolRouterSessionSearchResponse,
} from '@composio/core';

const config = {
  toolkits: ['gmail'],
  tools: { gmail: { enable: ['GMAIL_FETCH_EMAILS'] } },
  preload: { tools: ['GMAIL_FETCH_EMAILS'] },
  manageConnections: { enable: true },
} satisfies ToolRouterCreateSessionConfig;

type Create = Composio['create'];
type Session = Awaited<ReturnType<Create>>;
type ReturnedConfig = ToolRouterSessionConfig;
type ExecuteResult = ToolRouterSessionExecuteResponse;
type SearchResult = ToolRouterSessionSearchResponse;
```

`tools` is a **toolkit-keyed map**, not an array. `SessionPreset` is a named export from `@composio/core`; `SessionPreset.DIRECT_TOOLS` exposes allowed tools directly and disables meta tools by default. `ToolRouterUpdateSessionConfig` describes updates; `ToolRouterSessionConfig` describes the server's returned configuration, not create input.

For a compact offline reference, read [`docs/sessions.md`](./docs/sessions.md) in this package. The package ships:

- `dist/index.d.mts`: the public declaration entry point (also selected by the export map). Follow its declaration imports rather than guessing hashed filenames.
- `src/types/toolRouter.types.ts`: readable session configuration, options, and response types.
- `src/composio.ts`: `Composio.create` and `Composio.use` signatures.
- `src/models/ToolRouterSession.ts`: session methods, including `tools`, `authorize`, `search`, and `execute`.

These source paths are for reading, not deep imports. Use the public `@composio/core` entry point in your code. Type inspection requires no credentials; client construction and backend operations still require authentication.

## Providers

A provider formats session tools for your agent framework and wires up execution:

```typescript
import { Composio } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';

const composio = new Composio({ provider: new OpenAIAgentsProvider() });

const session = await composio.create('user_123');
const tools = await session.tools(); // ready to pass to the OpenAI Agents SDK
```

Adapters exist for OpenAI, OpenAI Agents, Anthropic, Claude Agent SDK, Vercel AI SDK, Google GenAI, LangChain, LlamaIndex, Mastra, and Cloudflare Workers AI. See the [provider table](https://github.com/ComposioHQ/composio#providers) and the [framework quickstarts](https://docs.composio.dev/docs/quickstart).

## MCP

Every session also exposes a hosted MCP endpoint. Pass `mcp: true` to surface it in the type, then point Claude, Cursor, or any MCP client at it:

```typescript
const session = await composio.create('user_123', { mcp: true });

console.log(session.mcp.url);
console.log(session.mcp.headers);
```

See [sessions via MCP](https://docs.composio.dev/docs/sessions-via-mcp).

## Modifiers

`session.tools()` accepts modifiers to transform tool schemas and intercept execution:

```typescript
const tools = await session.tools({
  modifySchema: ({ toolSlug, toolkitSlug, schema }) => ({
    ...schema,
    description: `${schema.description} (via my-app)`,
  }),
  beforeExecute: ({ toolSlug, toolkitSlug, params }) => params,
  afterExecute: ({ toolSlug, toolkitSlug, result }) => result,
});
```

See [modify tool behavior](https://docs.composio.dev/docs/tools-direct/modify-tool-behavior/schema-modifiers).

## Configuration

The `Composio` constructor accepts:

```typescript
interface ComposioConfig {
  apiKey?: string | null; // Defaults to COMPOSIO_API_KEY
  baseURL?: string | null; // Custom API base URL
  provider?: TProvider; // Provider adapter (default: OpenAIProvider)
  allowTracking?: boolean; // Enable/disable telemetry (default: true)
  defaultHeaders?: ComposioRequestHeaders; // Extra headers for API requests
  disableVersionCheck?: boolean; // Skip the SDK version check (default: false)
  dangerouslyAllowAutoUploadDownloadFiles?: boolean; // Auto file upload/download during execution (default: false)
}
```

Environment variables:

- `COMPOSIO_API_KEY`: your Composio API key
- `COMPOSIO_BASE_URL`: custom API base URL
- `COMPOSIO_LOG_LEVEL`: `silent`, `error`, `warn`, `info`, or `debug`
- `COMPOSIO_TOOLKIT_VERSION_<TOOLKIT>`: pin a toolkit version, e.g. `COMPOSIO_TOOLKIT_VERSION_GITHUB=20250902_00`

## Beyond sessions

The `Composio` instance also exposes `composio.toolkits`, `composio.triggers`, `composio.authConfigs`, and `composio.connectedAccounts` for managing resources outside a session. The older [direct tool execution](https://docs.composio.dev/docs/tools-direct/executing-tools) flow (`composio.tools.get` and `composio.tools.execute`) still works but is legacy; prefer sessions for new code.

## Support

- [Documentation](https://docs.composio.dev)
- [TypeScript SDK reference](https://docs.composio.dev/reference/sdk-reference/typescript)
- [Discord community](https://discord.gg/composio)
- [Open an issue](https://github.com/ComposioHQ/composio/issues)

## License

MIT
