# Plan 005: Migrate published OpenAI consumers to v7 while preserving v6 support

> **Executor instructions**: Follow each step and run every verification. Stop
> on any condition listed below; do not improvise. When complete, update this
> plan's row in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 03291bfaa..HEAD -- pnpm-workspace.yaml pnpm-lock.yaml ts/packages/core/package.json ts/packages/slim/package.json ts/packages/providers/openai/package.json ts/packages/core/src/provider/OpenAIProvider.ts ts/packages/providers/openai/src/OpenAIResponsesProvider.ts ts/e2e-tests/runtimes/node/openai-zod4-compat`
> Re-audit OpenAI-owned exported types and package metadata if any path changed.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `03291bfaa`, 2026-08-03
- **Source PR**: [GitHub #4005](https://github.com/ComposioHQ/composio/pull/4005) ([Glen review](https://app.tryglen.com/review/ComposioHQ/composio/4005))

## Why this matters

The current Dependabot diff changes a runtime dependency of published
`@composio/core` and `@composio/slim`, and changes the published peer major of
`@composio/openai`. OpenAI v7's documented runtime break is Node 22+, which
matches this repository's support floor, but exported OpenAI-owned types and
downstream installation still need dual-major proof. The existing PR ran only
build and generic checks.

## Current state

- `pnpm-workspace.yaml:52` catalogs `openai: ^6.49.0`.
- `ts/packages/core/package.json` and `ts/packages/slim/package.json` carry the
  catalog entry as a runtime dependency.
- `ts/packages/providers/openai/package.json` uses `catalog:` as its peer range;
  changing the catalog directly would drop declared v6 compatibility.
- Core and the dedicated provider export types derived from OpenAI namespaces
  in `OpenAIProvider.ts` and `OpenAIResponsesProvider.ts`.
- `ts/e2e-tests/runtimes/node/openai-zod4-compat` pins OpenAI 6, but currently
  installs only `@composio/core` with `--legacy-peer-deps`; it does not prove the
  dedicated provider's peer contract and has stale `openai@5` assertion labels.
- The Node E2E matrix is 22.22.3, 24.17.0, and 25.9.0, all compatible with
  OpenAI v7's Node 22 floor.

Use the newest OpenAI 7 release permitted by `minimumReleaseAge: 4320`, not the
stale 7.0.0 target from the bot body.

## Commands

| Purpose           | Command                                                                                                 | Expected result                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Resolve           | `mise exec -- pnpm install --lockfile-only`                                                             | exit 0                                                         |
| Reproducibility   | `CI=true mise exec -- pnpm install --frozen-lockfile`                                                   | exit 0                                                         |
| Peer policy       | `mise exec -- pnpm check:peer-deps`                                                                     | exit 0                                                         |
| Changesets        | `mise exec -- pnpm validate:changesets`                                                                 | exit 0                                                         |
| Core              | `mise exec -- pnpm --filter @composio/core typecheck && mise exec -- pnpm --filter @composio/core test` | all pass                                                       |
| OpenAI provider   | `mise exec -- pnpm --filter @composio/openai build && mise exec -- pnpm --filter @composio/openai test` | all pass                                                       |
| Examples          | `mise exec -- pnpm typecheck:examples && mise exec -- pnpm test:examples`                               | all pass                                                       |
| Packages          | `mise exec -- pnpm build:packages && mise exec -- pnpm typecheck`                                       | all pass                                                       |
| Unit tests        | `mise exec -- pnpm test`                                                                                | all pass                                                       |
| OpenAI v6 fixture | `mise exec -- pnpm --filter @e2e-tests/node-openai-zod4-compat test:e2e:node`                           | install, typecheck, and runtime assertions pass on Node matrix |
| OpenAI v7 fixture | `mise exec -- pnpm --filter @e2e-tests/node-openai-v7-zod4-compat test:e2e:node`                        | install, typecheck, and runtime assertions pass on Node matrix |
| Cloudflare        | `mise exec -- pnpm test:e2e:cloudflare`                                                                 | all pass in credentialed CI                                    |
| Audit             | `mise exec -- pnpm audit --prod --audit-level=high`                                                     | no high/critical production advisory introduced                |

## Scope

**In scope**:

- `pnpm-workspace.yaml`, `pnpm-lock.yaml` through pnpm.
- `ts/packages/providers/openai/package.json` for an explicit dual-major peer.
- `ts/e2e-tests/runtimes/node/openai-zod4-compat/**` to make the v6 proof real
  and correct stale labels.
- A new `ts/e2e-tests/runtimes/node/openai-v7-zod4-compat/**` sibling fixture.
- One or more `.changeset/*.md` files covering `@composio/core`,
  `@composio/slim`, and `@composio/openai`.

**Out of scope**:

- Dropping OpenAI 6 support without an explicit product decision.
- Changing the repository's Node support floor.
- Live API calls, real keys, generated SDK surfaces, or OpenAI API behavior.
- Source edits made only to silence incompatible exported types.

## Git workflow

- Branch from the latest `origin/next`.
- Commit 1: `test(openai): cover v6 and v7 consumers`
- Commit 2: `chore(deps): migrate OpenAI runtime to v7`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Establish consumer fixtures before the catalog bump

Strengthen `openai-zod4-compat` so it packs and installs the published
`@composio/openai` package against explicit OpenAI 6 and runs a TypeScript
assignability check for exported tool/response types. Retain its offline
`wrapTool` runtime assertions. Correct all `openai@5` comments and markers to
OpenAI 6.

Create `openai-v7-zod4-compat` from the same pattern with explicit OpenAI 7.
Both fixtures must install packed packages as consumers receive them; do not
use workspace source imports or `skipLibCheck` to hide peer/type conflicts.

Run both fixtures before changing the catalog. The v7 fixture may fail at this
point because the provider peer excludes v7; that is the expected baseline.

### Step 2: Update runtime and peer ranges

Update the catalog to the selected OpenAI 7 release. Replace the dedicated
provider's `catalog:` peer with an explicit `^6.49.0 || ^7.0.0` range so the
catalog update does not silently drop v6 consumers. Generate the lockfile and
run core and provider typecheck/build/tests.

Do not alter exported type aliases unless the existing shapes fail under one of
the supported majors. If they do, stop and report the exact incompatible types.

### Step 3: Add release metadata

Add a patch Changeset for fixed-group packages `@composio/core` and
`@composio/slim`, describing the runtime dependency refresh. Add a minor
Changeset for `@composio/openai`, following the prior `@composio/vercel` dual
major support precedent, because the published peer contract gains v7 support.

### Step 4: Run the full regression matrix

Run every command in the Commands table from a frozen install. Require both
consumer fixtures on all supported Node majors and the existing Cloudflare
tests, because Cloudflare examples also consume the OpenAI catalog entry.

## Test plan

- OpenAI 6: packed provider install, exported-type compile check, client
  construction with a fake key, `wrapTool`, and no network request.
- OpenAI 7: the same checks against the v7 package.
- Keep Zod 4 in both fixtures to retain the prior peer-resolution regression.
- Existing core/provider unit suites remain authoritative for wrapping behavior.

## Done criteria

- [ ] Core and slim resolve a policy-eligible OpenAI 7 runtime.
- [ ] `@composio/openai` declares and proves OpenAI 6 and 7 peers.
- [ ] Both packed consumer fixtures pass on Node 22, 24, and 25 without real keys.
- [ ] Patch changesets cover core/slim; a minor changeset covers the provider.
- [ ] Frozen install, peer, examples, builds, types, tests, E2E, and audit pass.
- [ ] The Node support floor and generated code are unchanged.

## STOP conditions

- The selected OpenAI v7 release requires a runtime newer than the supported
  Node matrix.
- Exported provider types cannot compile against both OpenAI 6 and 7.
- Supporting both majors requires weakening types, `skipLibCheck`, or duplicate
  public APIs.
- Existing OpenAI 6 behavior fails after the runtime dependency update.
- The change needs a product decision to drop v6 or change a public type.
