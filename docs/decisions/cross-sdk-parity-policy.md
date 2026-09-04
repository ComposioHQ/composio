# Cross-SDK Parity Policy

## Decision

The TypeScript and Python SDKs expose the same conceptual model, and we keep them at declared parity through one policy, one living matrix, and a planned CI check. TypeScript is the reference implementation: a new capability lands in TypeScript first and in Python within an agreed window, and the matrix records the state at every point so "are they at parity?" has an answer that does not depend on someone's memory.

Parity is not uniformity. Some divergence is correct and stays, as long as it is declared. The policy draws the line between divergence we accept on purpose and drift we treat as a bug.

## Problem

The two SDKs are close on the big surfaces and diverge in ways no document captures. The audit found the divergence in three places. Provider sets differ (TypeScript ships cloudflare, vercel, and mastra; Python ships autogen, crewai, langgraph, google_adk, and gemini). The same name means different things (`google` is the GenAI SDK in TypeScript but Vertex AI in Python). And the error model differs (TypeScript has a coded taxonomy, Python has none). None of this is written down, so it decays the moment one SDK ships a feature the other does not. A "joint 1.0" claim without an enforced matrix is a claim that rots on day one.

## TypeScript is the reference implementation

The code already says so: Python source carries comments like `# in ts it's AuthConfigUpdateResponse`, and TypeScript is the larger surface with the richer error taxonomy. We make that explicit rather than leave it implied. New behavior lands in TypeScript first; Python follows within one minor release. The matrix flags anything TypeScript-ahead so the gap is visible and bounded, not silent.

## Naming rule

Every public namespace and method maps one-to-one across the two SDKs after normalizing camelCase to snake_case. `listActive` in TypeScript is `list_active` in Python, never `active_list`. The planned `validate:sdk-parity` check enforces this by diffing the normalized name sets, so a rename on one side that is not mirrored on the other fails CI once B9 is implemented.

One rename is required before 1.0 freezes the import names. Today `google` means the Google GenAI SDK in TypeScript but Vertex AI in Python, while Python also ships `gemini` for GenAI. We adopt one scheme in both languages:

- `gemini` is the Google GenAI SDK (`@google/genai`, `google-genai`).
- `google` is Vertex AI (`google-cloud-aiplatform`).

So TypeScript renames `@composio/google` to `@composio/gemini`. The download numbers make the blast radius small and confirm the scheme matches usage: `@composio/google` draws about 5.6k downloads a month against core's 1.36M, and on PyPI the GenAI package `composio-gemini` (18.7k a month) already outdraws the Vertex package `composio-google` (1.46k) by more than ten to one. The popular case keeps the name it already has in Python; the niche case keeps the precise name.

## Provider divergence is allowed when declared

A provider lives only in the language where it makes sense. Nobody wants a Python adapter for the Vercel AI SDK, and nobody wants a TypeScript adapter for CrewAI. The matrix records each asymmetry as `n/a-by-design` with a one-word reason rather than treating it as a gap to close. New providers are not a 1.0 requirement; an undeclared asymmetry is the only failure.

## Async

Python ships both a synchronous and an asynchronous client before 1.0, mirroring the pattern users already know from `openai` and `anthropic` (a `Composio` and an `AsyncComposio`). This is the one real capability gap the audit found, and the peer SDKs our users run alongside ours all ship both. Adding async after 1.0 would be non-breaking, so this could slip; we pull it into 1.0 because the gap is visible the day someone builds an async server and reaches for our SDK out of habit.

## Errors

Both SDKs implement one shared, language-neutral error-code catalog. The codes use a `COMPOSIO::` prefix and carry the same semantics in both languages, with idiomatic class names on top (`ComposioToolNotFoundError` in TypeScript, `ToolNotFoundError` in Python), both exposing the same `code`. TypeScript has the richest taxonomy today, so it seeds the catalog; in doing so it drops its current `TS-SDK::` prefix for the neutral one. Python gains codes where it has none and stops collapsing MCP failures into a generic `ValidationError`, so a 404, a 401, and a network failure become distinguishable. The catalog is a committed artifact both SDKs build against, not a per-language convenience.

## Planned enforcement

A `validate:sdk-parity` check, modelled on the existing `validate:agent-skills` validator, is required before 1.0 and tracked as B9 in `sdk-v1-readiness.md`. Once implemented and wired into `ts.test.yml` and `py.check.yaml`, it diffs three things against this policy:

1. Namespace and method names, normalized camelCase to snake_case, against the declared matrix.
2. The provider directory lists (`ts/packages/providers/*` against `python/providers/*`) against the matrix, honoring `n/a-by-design` flags.
3. The recorded generated-client pin pair, so a client bump on one side that the other has not matched is visible.

The check will fail only on undeclared drift. Declared divergence will pass.

## The parity matrix

This is the live snapshot, with explicit target-state notes where a 1.0 rename is still pending. Update it in the same PR that changes a surface.

### Capabilities

| Capability | TypeScript | Python | Notes |
| --- | --- | --- | --- |
| tools (get/execute/search/raw) | stable | stable | |
| toolkits | stable | stable | |
| triggers + webhook verification | stable | stable | Pusher realtime both sides |
| auth_configs | stable | stable | Python returns to be tightened from `Dict` |
| connected_accounts | stable | stable | `initiate()` retiring, see migration record |
| files (upload/download) | stable | stable | same safety model both sides |
| modifiers (schema/before/after) | stable | stable | inline objects vs decorators |
| provider SPI | stable | stable | frozen for custom-provider authors |
| Tool Router | stabilizing for 1.0 | stabilizing for 1.0 | experimental today |
| MCP | experimental | experimental | graduates in a 1.x minor |
| custom tools / toolkits | experimental | experimental | under `experimental.*` |
| shared-account ACL | experimental | experimental | under `experimental.*` |
| async client | n/a (async-native) | pre-1.0 work | `AsyncComposio` |
| error codes | seeds the catalog | adopts the catalog | shared `COMPOSIO::` prefix |

### Providers

| Provider | TypeScript | Python | Reason if asymmetric |
| --- | --- | --- | --- |
| openai | yes | yes | |
| anthropic | yes | yes | |
| claude-agent-sdk | yes | yes | |
| langchain | yes | yes | |
| llamaindex | yes | yes | |
| openai-agents | yes | yes | |
| gemini (Google GenAI) | pre-1.0 rename required (currently `google`) | yes | TS package is still `ts/packages/providers/google` |
| google (Vertex AI) | n/a-by-design | yes | GCP-enterprise, low TS demand |
| google_adk | n/a-by-design | yes | Python ecosystem |
| langgraph | n/a-by-design | yes | Python ecosystem |
| crewai | n/a-by-design | yes | Python ecosystem |
| autogen | n/a-by-design | yes | Python ecosystem |
| cloudflare | yes | n/a-by-design | JS runtime |
| vercel (AI SDK) | yes | n/a-by-design | JS ecosystem |
| mastra | yes | n/a-by-design | JS ecosystem |

## Considered alternatives

- **Treat error codes as a TypeScript convenience and leave Python on typed exceptions plus HTTP status.** Rejected. It permanently diverges the error contract at exactly the moment we are freezing it, and it makes cross-language error handling impossible to learn once.
- **Reconcile the provider sets to a strict intersection.** Rejected. It would delete adapters people use and would build adapters nobody wants. Declared divergence serves users better than forced symmetry.
- **Keep parity as prose in the `cross-sdk-parity` skill, without a check.** Rejected. Prose cannot fail a build, and the audit showed the prose was already out of date.

## FAQ

**Why is TypeScript the reference and not Python?** Because the code already treats it that way and TypeScript carries the larger surface. The choice matters less than writing it down; the point is one direction, not two.

**Does a provider have to exist in both languages to count for parity?** No. It has to be declared. An adapter that exists in one language by design is at parity; an adapter missing by accident is not.

**What happens when the backend ships a feature?** It lands in TypeScript first, Python within a minor, and the matrix carries the gap in between. The window is bounded and visible.
