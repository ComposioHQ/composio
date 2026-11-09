# Session API reference in the installed package

Inspect session types through `@composio/core` without constructing a client, configuring credentials, or probing Zod internals.

```typescript
import type {
  Composio,
  ToolRouterCreateSessionConfig,
  ToolRouterUpdateSessionConfig,
  ToolRouterSessionConfig,
  ToolRouterSessionExecuteResponse,
  ToolRouterSessionSearchResponse,
} from '@composio/core';

const options = {
  toolkits: ['gmail'],
  tools: { gmail: { enable: ['GMAIL_FETCH_EMAILS'] } },
  preload: { tools: ['GMAIL_FETCH_EMAILS'] },
  manageConnections: { enable: true },
} satisfies ToolRouterCreateSessionConfig;

type Create = Composio['create'];
type Session = Awaited<ReturnType<Create>>;
type Tools = Awaited<ReturnType<Session['tools']>>;
type Update = ToolRouterUpdateSessionConfig;
type ReturnedConfig = ToolRouterSessionConfig;
type ExecuteResult = ToolRouterSessionExecuteResponse;
type SearchResult = ToolRouterSessionSearchResponse;
```

This snippet only declares configuration and types. It does not create a session or execute a tool. Actual client construction and backend operations still require authentication.

## Creation and configuration

`composio.create(userId, options?)` creates a session. `composio.use(sessionId, options?)` retrieves one. Both return promises. Read `src/models/ToolRouter.ts` for their overloads, including the `mcp: true` return type and provider-specific tool collection types.

Use `ToolRouterCreateSessionConfig` for input. The main options are:

| Option                             | Input shape                                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toolkits`                         | Toolkit slug array, `{ enable: string[] }`, or `{ disable: string[] }`. Policy objects can also carry experimental `requireApproval`.                                            |
| `tools`                            | Toolkit-keyed map. Each value is a tool slug array, an enable/disable policy, or a tag filter. Policy objects can also carry experimental `requireApproval`.                     |
| `tags`                             | Global tag array or enable/disable policy, with optional experimental `requireApproval`.                                                                                         |
| `authConfigs`                      | Toolkit slug to auth config ID.                                                                                                                                                  |
| `connectedAccounts`                | Toolkit slug to connected account ID or array of IDs.                                                                                                                            |
| `manageConnections`                | Boolean or `{ enable?, callbackUrl?, waitForConnections? }`.                                                                                                                     |
| `preload`                          | `{ tools?: string[] \| 'all' }`. Exposes selected tools directly rather than requiring search.                                                                                   |
| `sessionPreset`                    | `SessionPreset.DIRECT_TOOLS`, a named export from `@composio/core`. Exposes allowed tools directly and disables meta tools by default; explicit supported overrides still apply. |
| `sandbox`                          | `{ enable?, enableProxyExecution?, autoOffloadThreshold?, sandboxSize? }`.                                                                                                       |
| `multiAccount`                     | `{ enable?, maxAccountsPerToolkit?, requireExplicitSelection? }`.                                                                                                                |
| `proxyExecute`                     | Boolean or `{ enable: boolean }`.                                                                                                                                                |
| `mcp`                              | Set `true` to expose `session.mcp` in the returned type.                                                                                                                         |
| `hooks`, `instant`, `experimental` | Read the named types and field descriptions in `src/types/toolRouter.types.ts`; experimental fields may change.                                                                  |

An omitted `toolkits` is unrestricted; `{ enable: [] }` denies all app toolkits. `preload.tools: 'all'` needs a positive filter such as `toolkits`, `tools`, or `tags`; the backend validates and caps the tool set. A saved `experimental.sessionConfigId` cannot be combined with inline access filters, hooks, or local tools/toolkits. The source contains the complete unions and restrictions, including supported legacy options.

`session.update(config)` accepts `ToolRouterUpdateSessionConfig`. Its result and `session.config` use `ToolRouterSessionConfig`, the server response shape. Do not use that response type as create input.

## Session methods and response types

Read `src/models/ToolRouterSession.ts` for implementations and `src/types/toolRouter.types.ts` for signatures and response definitions:

| Method                                            | Public type or result                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `session.tools(options?)`                         | Provider-specific tool collection; inspect `ToolRouterToolsFn` or infer it from your client as above. |
| `session.authorize(toolkit, options?)`            | `ConnectionRequest`; inspect `ToolRouterAuthorizeFn`.                                                 |
| `session.toolkits(options?)`                      | `ToolkitConnectionsDetails`.                                                                          |
| `session.search(params)`                          | `ToolRouterSessionSearchResponse`.                                                                    |
| `session.execute(toolSlug, arguments?, options?)` | `ToolRouterSessionExecuteResponse`; options use `ToolRouterSessionExecuteOptions`.                    |
| `session.executeMeta(slug, arguments?, options?)` | `ToolRouterSessionExecuteResponse`; options use `ToolRouterSessionExecuteMetaOptions`.                |
| `session.proxyExecute(params)`                    | `ToolRouterSessionProxyExecuteResponse`.                                                              |
| `session.update(config)`                          | `ToolRouterSessionConfig`.                                                                            |
| `session.listConfigHistory(options?)`             | `ToolRouterSessionListConfigHistoryResponse`.                                                         |

## Files you can read locally

- `README.md` and this `docs/sessions.md` ship in the npm tarball.
- `dist/index.d.mts` is the public declaration entry point from the package export map. Follow its imports to shared declaration files; hashed filenames are build details.
- `src/types/toolRouter.types.ts`, `src/composio.ts`, `src/models/ToolRouter.ts`, and `src/models/ToolRouterSession.ts` are readable distributed source, not supported deep-import entry points.

Provider packages have their own file lists. In particular, `@composio/openai-agents` ships `dist/index.d.mts` and its README, not `src/index.ts`. Read session configuration in the separately installed `@composio/core` package and import session types from `@composio/core`.
