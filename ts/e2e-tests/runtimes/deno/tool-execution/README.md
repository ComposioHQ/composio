# Deno Core Tool Execution Test

Verifies that `@composio/core`'s runtime — not just its import surface — works in Deno:
session creation over `fetch`, custom-tool registration, Zod input validation, and
in-process local tool execution on the Effect v4 build.

## Why This Exists

The `esm-basic` suite proves the package can be imported under Deno. It deliberately stops
there. This suite drives the actual runtime machinery — the code most likely to break on a
non-Node runtime (provider wiring, schema validation, session context injection, tool
routing) — inside the same Deno 2.6.7 image.

Local tools execute in-process, so the only backend call is `composio.create()`. Remote
coverage (tool chaining, missing-tool errors, weathermap execution) lives in the node
`custom-tools` suite, which this mirrors.

Requires `COMPOSIO_API_KEY` in the environment. CI provides it and the runner passes it
into the container.

## What It Tests

| Test                   | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| Session create         | `composio.create()` succeeds over `fetch`               |
| Local execute          | Custom tool runs in-process and returns data            |
| Zod defaults           | `.default()` values applied to omitted input            |
| Error handling         | Thrown tool errors wrap into `{ data, error }`          |
| Zod validation failure | Wrong-typed input surfaces a validation error, no crash |
| Multiple tools         | Each slug routes to its own execute fn                  |
| Session context        | `ctx.userId` matches the session's user                 |
| Case-insensitive slugs | `get_user_context` resolves                             |
| Prefixed slugs         | `LOCAL_GET_USER_CONTEXT` resolves                       |

## Fixture

```
fixtures/
└── test.ts # Deno test script
```

The fixture imports the workspace's **built dist directly** via a relative path
(`../../../../../packages/core/dist/index.mjs`), so it exercises the local Effect v4 build
baked into the image by the CI Build step — not whatever version `npm:@composio/core`
would resolve to from the registry. A version-less `npm:` specifier ignores the pnpm
workspace symlink and downloads the published package, which is why the direct path is
load-bearing here.

`zod` comes in via `npm:zod/v3`, matching the node `custom-tools` fixture's schema
surface.

## Isolation Tool

**Docker** with Deno version: 2.6.7

## Running

```bash
pnpm test:e2e:deno
```
