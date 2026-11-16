# Fake Composio backend

Test support for the CLI suites in `../operations`. One process answers for every host the `composio` binary talks to, so a test never reaches a real Composio, GitHub, or PostHog endpoint.

| Host the CLI calls | Pointed here by                                          | Listener |
| ------------------ | -------------------------------------------------------- | -------- |
| Backend API        | `COMPOSIO_BASE_URL`                                      | HTTP     |
| Dashboard          | `COMPOSIO_WEB_URL`                                       | HTTPS    |
| Agents service     | `COMPOSIO_AGENTS_BASE_URL`                               | HTTP     |
| GitHub releases    | `COMPOSIO_GITHUB_API_BASE_URL` and `COMPOSIO_GITHUB_URL` | HTTP     |
| PostHog            | `COMPOSIO_POSTHOG_INGEST_URL`                            | HTTP     |

`fake.cliEnv()` returns that environment. The Dashboard listener speaks TLS because the CLI sends a user API key to the Dashboard only over `https:` (or to loopback); the certificate is generated with the host's `openssl` at start and trusted in the container through `NODE_EXTRA_CA_CERTS`.

## What it gives a test

```ts
import { startCliRig } from '@e2e-tests/cli-fake-backend/rig';

const rig = await startCliRig();
await rig.login();
const result = await rig.run('composio search "send a slack message"');

result.exitCode; // what the CLI did
result.requests; // what the fake received while it ran
rig.fake.world; // seeded state, and stand-ins for a person (linkLoginSession, connect)
rig.fake.faults.inject({
  route: 'toolRouter.session.search',
  fault: { kind: 'status', status: 500 },
});
```

- **Journal** (`src/journal.ts`). Every request, in order, with what the test usually wants to assert already resolved: the service it was for, the route that answered, the key class (`user` for `uk_`, `project` for `ak_`, `agent` for `cak_`), whether this deployment issued the key, the org, the project by its seeded label (`consumer`, `developer`, `developer-other`), how the project was learned (`scope-headers`, `project-key`, `key-default`, `route`), the project the request itself named (`requestedProject`, which a tool-router session can override), the user the request acted as, whether it changed anything (`tool-executed`, `connection-started`), and for an execution the tool and arguments it ran with, whichever of the three execute routes ran it.
- **World** (`src/world.ts`). One org member, one user API key, a consumer project, two developer projects, four toolkits, five tools. Ids and timestamps are fixed, so two runs print the same bytes. A second fake started with `{ userApiKey }` is a deployment that never issued the first one's key.
- **Faults** (`src/faults.ts`). Per route or per `METHOD /path` pattern, for a number of requests: a status with the standard error envelope, a delay, a reset before the response, a reset in the middle of the body, a body that is not JSON, JSON of another shape, an HTML page, an empty body.

Run it by hand to poke at the CLI:

```bash
bun ts/e2e-tests/cli/fake-backend/src/main.ts /tmp/fake-ca.pem
```

## Fidelity

**Verified.** Each route named after a `@composio/client` operation answers with a body that the client's own response schema for that operation decodes. `contract.test.ts` calls every such route and decodes the answer with `schemaLoaders` from `@composio/client/effect/schemas`; it also fails when a typed route has no sample. Run it with `pnpm --filter @e2e-tests/cli-fake-backend test:e2e:cli` (no Docker needed).

**Assumed, not verified.** Read these before trusting a result that depends on them.

- The client schemas are permissive (unknown fields pass, most fields are optional). A decoded response has the required fields with the right types; it is not shown to be what the real backend sends for that request.
- Routes the client does not type are written from the CLI source that calls them: the Dashboard procedures `/api/cli/trpc/execute` and `executeMeta` (envelope from `dashboard-tool-execution.ts`), `POST /api/v3/org/project/{id}/api_keys/create`, `GET /api/v3/tools/{slug}/get_latest_version`, `POST /api/v3/cli/analytics`, the agents service, the GitHub release API, PostHog capture.
- Error responses use the envelope the CLI's error extraction reads (`{ error: { message, code, slug, status, request_id, suggested_fix } }`). The slugs and codes are the ones the CLI special-cases (`ToolRouterV2_NoActiveConnection`, `ActionExecute_ConnectedAccountNotFound`, 4302); every other slug is invented.
- Authorization rules are a model: a user key with `x-org-id` and `x-project-id` acts on that project; a project key acts on its project; **a user key with no scope acts on the org's default developer project**, the one `auth/session/info` reports. The last rule is a guess at what the real backend does with such a request. The journal marks those requests `key-default` so a test can see when the CLI relied on it.
- `auth/session/info` for a user key reports the default developer project, never the consumer project.
- Search is keyword matching over five tools. Tool executions return canned data. Nothing here says a real toolkit would accept the arguments.
- **Tool arguments are not validated.** A tool runs with whatever arrives, a missing required argument included. The CLI validates against the tool's schema first, but sends the call anyway when it cannot load that schema (`validateToolInputBeforeExecute`), relying on the server. The real answer to an invalid input was never captured, so the fake does not invent one; a test that depends on the arguments asserts them from the journal.
- A tool-router session acts on the project it was created for, whatever project the request names. Whether the real backend rejects a request whose scope differs from its session's is unknown; the journal keeps both (`project`, `requestedProject`) so a test can require them to agree.
- A link request starts a connection as `INITIATED`; it turns `ACTIVE` after `world.linkCompletesAfterPolls` status reads, or never, or when its redirect URL is loaded: there is no OAuth page behind that URL, and a `GET` of it stands for the person approving. The world remembers which approvals came from the person and whether any answer has since reported them (`unreportedApprovals`), which is how a journey's person knows the agent cannot have seen one yet.
- Retry-After, rate-limit headers, pagination past one page, request size limits, and timeouts on the server side are not modelled.

## Not here

Triggers, realtime (Pusher), logs, file uploads, `proxy`, MCP, and toolkit versions beyond one fixed version per toolkit have no routes. A command that needs one gets a 404 with slug `Fake_UnhandledRoute`, which the journal records with `route: null`.
