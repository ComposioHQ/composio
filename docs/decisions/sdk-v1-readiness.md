# Composio SDK Parity and v1.0 Readiness

The decisions for a coordinated Composio SDK 1.0 live in three records under `docs/decisions/`: `sdk-1.0-stability-contract.md`, `cross-sdk-parity-policy.md`, and `sdk-v0-to-v1-migration.md`. This document holds the analysis behind them and the engineering backlog they do not carry: a side-by-side reading of the two SDKs, and the concrete blockers that must clear before either can tag 1.0. I verified the load-bearing claims against the code; the ones I checked directly are marked.

Scope: the TypeScript SDK (`@composio/core` plus `ts/packages/providers`) and the Python SDK (`python/composio` plus `python/providers`). Captured 2026-06-26.

## Part 1: what the two SDKs are and how they differ

### The same model in two languages

Both SDKs expose one conceptual model: a `Composio` class, generic over a provider, defaulting to OpenAI, with the same resource namespaces and the same capabilities. Learn one and you know the other. The differences are polish, breadth, and idiom, not behavior.

The surfaces match on both sides: `tools` (get, execute, search, raw), `toolkits`, `triggers` (with Pusher realtime and webhook V1/V2/V3 verification), `auth_configs`, `connected_accounts` (full lifecycle), `mcp`, `tool_router` sessions (`create`/`use`), `experimental` (custom and local tools, shared-account ACL), the modifier hooks (schema, before-execute, after-execute), file upload and download under the same safety model (`dangerously_allow_*` flags, a sensitive-path denylist, an upload allowlist), toolkit-version handling, and telemetry. Both wrap a Stainless-generated client, and both use generics so provider return types flow through `tools.get()`.

### Snapshot

| Dimension | TypeScript `@composio/core` | Python `composio` |
|---|---|---|
| Version | 0.12.0 (providers 0.10.0) | 0.16.0 (providers 0.16.0) |
| Size | ~21k LOC, 111 src files | ~14.8k LOC, ~53 src files |
| Tests | ~40 test files, ~970 cases (Vitest, mocked client) | ~38 test files, ~825 cases, plus a dedicated `type_inference` mypy suite |
| Validation | Zod (v3 and v4) | Pydantic v2 |
| Error base | `ComposioError extends Error` (codes `TS-SDK::…`, `possibleFixes`, `errorId`), ~40 subclasses | `ComposioError(Exception)` (message, delegate), rich subclass tree |
| Generated client | `@composio/client` (catalog pin `0.1.0-alpha.74`) | `composio-client==1.41.0`, plus a hand-written `HttpClient` wrapper |
| Concurrency | async, event-loop native | fully synchronous; no async API, and custom tools reject `async def` |
| Runtimes | node and Cloudflare `workerd` (import maps) | single runtime |
| Role | de-facto lead and reference implementation (more LOC, more error types, ~29 `@deprecated` markers) | tracks TypeScript (code carries `# in ts it's AuthConfigUpdateResponse` notes) |
| Idiom | camelCase, inline modifier objects | snake_case, `@before_execute` decorators |

### Provider adapters: the biggest concrete divergence

TypeScript ships 10, Python ships 12.

| Shared (7) | TS-only (3) | Python-only (5) |
|---|---|---|
| openai, anthropic, claude-agent-sdk, langchain, llamaindex, openai-agents, google\* | cloudflare, vercel (AI SDK), mastra | autogen, crewai, langgraph, google_adk, gemini |

\* The name `google` means different things. In TypeScript it is the Google GenAI SDK (`@google/genai`). Python splits it: `google` is Vertex AI (`google-cloud-aiplatform`) and `gemini` is GenAI (`google-genai`). So TypeScript `google` lines up with Python `gemini`, and Python `google` (Vertex) has no TypeScript counterpart. The parity policy fixes this before the import name freezes.

### Maturity verdict

Roughly tied on core capabilities. TypeScript leads: it is larger, it reaches new and deprecated surfaces first, its typed-error taxonomy is more granular, and it targets two runtimes. Python is solid and well-tested, but it tracks TypeScript, lags slightly on the newest surfaces, returns a bare `t.Dict` from a few methods (auth-config update and delete, MCP get and update), collapses MCP failures into a generic `ValidationError`, and ships no async client. Async is the one real capability gap.

### Known in-flux surfaces

- `tool_router` sessions and `create`/`use`, marked experimental on both sides.
- `experimental.*`: custom tools, custom toolkits, the shared-connection ACL.
- MCP types. TypeScript draws them from `mcp.experimental.types`; Python re-declares `ConfigToolkit` because the generated client dropped it in 1.41.0, which is a regen-fragility signal.
- TypeScript `@composio/core/generated` ships as a throwing stub for opt-in codegen.
- `connected_accounts.initiate()` is being retired for managed OAuth. The backend cutover is 2026-05-08 for new orgs and 2026-07-03 for all orgs, roughly a week out from this writing. `link()` is the replacement.

## Decisions

The decisions are settled and recorded as ADRs under `docs/decisions/`. Read them for the reasoning and the rejected alternatives:

- `sdk-1.0-stability-contract.md`: coordinated milestone with independent versions, the in-and-out scope, the stable-versus-experimental tiers (Tool Router stabilized, MCP experimental), generated-client graduation, and the deprecation policy.
- `cross-sdk-parity-policy.md`: TypeScript as the reference, the 1:1 naming rule and the `@composio/google` to `@composio/gemini` rename, declared provider divergence, Python sync and async, the shared `COMPOSIO::` error catalog, and the parity matrix.
- `sdk-v0-to-v1-migration.md`: the final 0.x deprecation release, alias bridges through 1.x removed at 2.0, and the migration tooling (codemod, `v1-migration` skill, migration doc page, docs version selector).

## Part 2: the readiness backlog

This is the work the ADRs decided on but do not themselves track. Most of it is downstream of those decisions.

### Must-settle blockers

| # | SDK | Item | Evidence | Why it blocks 1.0 |
|---|---|---|---|---|
| B1 | TS | Provider peer ranges cap core at `<1.0.0`; `check-peer-deps` exits non-zero | ✅ every provider declares `">=0.10.0 <1.0.0"`; `ts/scripts/check-peer-deps.ts:31` | Core `1.0.0` fails CI immediately. Widen the ranges once the versioning model is set |
| B2 | TS | Public types re-export the alpha `@composio/client` | `pnpm-workspace.yaml` pin; client types reach the surface through the connected-accounts, tool-router, MCP, and custom-tool types | A stable contract cannot rest on an alpha dependency. The contract ADR graduates the client to a stable line |
| B3 | TS | `@composio/core/generated` ships a throwing Proxy stub as a published subpath | `generated/index.js`; `package.json` exports `./generated` | Decide whether this opt-in codegen subpath is a 1.0 contract, then document or unpublish it |
| B4 | TS, Py | MCP surface is mislabeled and contradictory (both SDKs, independently found) | TS: `mcp` mounted non-experimental but typed from `mcp.experimental.types`; `wrapMcpServerResponse` is deprecated in favor of `wrapMcpServers`, which does not exist; docstrings call a nonexistent `composio.experimental.mcp`. Py: top-level `composio.mcp` but docstrings say `experimental.mcp`; `get`/`update` carry no explicit return type; several methods collapse errors into a generic `ValidationError` | The most prominent in-flux surface is exposed as stable. The contract keeps MCP experimental at 1.0 |
| B5 | TS | Remove the SDK-owned `@deprecated` APIs | OpenAI Assistants methods (noted "removed next major"), `ComposioError.exitProcess`/`exitCode`, the `./experimental` subpath, the deprecated MCP and auth-config schemas | 1.0 is the cheap moment to drop them. Keep only the ones that mirror live wire payloads. (Note: `createSession` is not deprecated; it stays) |
| B6 | Py | `connected_accounts.initiate()` legacy-OAuth retirement collides with the 1.0 timeline | `exceptions.py:337`; backend cutover 2026-07-03 for all orgs, about a week out | A method that is dead for managed OAuth would freeze as public API. The migration ADR treats it as a server-driven retirement and points docs and examples at `link()` |
| B7 | Py | Providers depend on an unpinned `composio` | all 12 `pyproject.toml`/`setup.py` files list a bare `"composio"` | `composio-openai==1.0.0` would resolve `composio==2.0.0`. Pin `>=1.0,<2` before publishing |
| B8 | Py | `__version__.py` drifts from `pyproject` | ✅ both statically read `0.16.0`; `bump.py` never touches `__version__.py` | The runtime `composio.__version__` (used in telemetry and the user agent) reports the wrong version after the next bump. Make `pyproject` dynamic, or update it in `bump.py` |
| B9 | both | Parity is not enforced in CI | the policy doc and parity matrix now exist (the ADRs in this PR), but `validate:agent-skills` is wired into no workflow, and `validate:sdk-parity` does not exist yet | Without a CI-enforced matrix, the parity the ADRs describe decays the moment one SDK ships ahead |

### Should-settle, same release

- TypeScript: stop the barrel `export *` from leaking internal Zod wire schemas (`mcp.types`); wire `publint` and `@arethetypeswrong/cli` into the release path, since they are dependencies today but nothing runs them, and the `exports` map plus conditional `imports` are exactly what they catch; add `typecheck` scripts and real tests to the nine thin providers; normalize the bare `zod` import and write down the v3/v4 support matrix.
- Python: tighten the `auth_configs.update`/`delete`/`update_status` `t.Dict` returns to concrete types (the code already carries `# FIXME: in ts it's AuthConfigUpdateResponse`); run the existing-but-skipped `test_type_inference_custom_provider.py`, because the custom-provider SPI is the type contract a 1.0 most needs to guarantee and it is currently unverified; consolidate the dual `pyproject` and `setup.py` metadata and add a `[build-system]` table.
- Cross-cutting: settle one changelog story across the TypeScript per-package changelogs, the hand-maintained `python/CHANGELOG.md`, and the product changelog; validate Python examples in CI the way TypeScript already does; fix `ts/docs/internal/release.md`, which still describes merging to `main`/`master` when the real base branch is `next`.

### Sequencing

1. Build `validate:sdk-parity` (diff namespace and method names after normalizing camelCase and snake_case; diff the provider directory lists against the matrix; check the generated-client pin pair), and wire it plus the existing `validate:agent-skills` and `validate:skill-routing` into `ts.test.yml` and `py.check.yaml`. This closes B9.
2. Clear the low-risk mechanical blockers: B1, B5, B7, B8.
3. Clear the decision-dependent blockers once the client graduates and MCP is settled: B2, B3, B4, B6.
4. Land the should-settle polish, then tag.

### Verified directly this pass

- ✅ B1: provider peer cap plus `check-peer-deps.ts` exiting non-zero.
- ✅ B8: `__version__.py` and `pyproject` both read `0.16.0`, and `bump.py` has zero references to `__version__`.
- ✅ B9: `validate:agent-skills` is referenced by no workflow.
- The MCP contradiction (B4) surfaced independently in both single-SDK audits.
