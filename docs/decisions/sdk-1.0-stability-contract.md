# SDK 1.0 Stability Contract

## Decision

We ship `@composio/core` (TypeScript) and `composio` (Python), together with their provider packages, as a coordinated 1.0 milestone with independent version numbers.

"Coordinated" is a single product promise: the same stability guarantees, the same split between stable and experimental surfaces, and the same deprecation policy, announced together. It is not a promise that the two ecosystems carry the same version integer. TypeScript releases through Changesets on merge to `next`; Python releases through tag-triggered builds. Forcing the numbers to match buys nothing a user values and adds a coordination cost to every release. What users want from "1.0" is "both SDKs are stable and at declared parity," which is a contract plus a matrix, not a matching string.

The stable surface follows semantic versioning with one precise reading: within the 1.x line we can add fields, methods, and namespaces, but we cannot remove or rename anything on the stable surface, and we cannot change the meaning of an existing field. Removing or renaming a stable API requires a 2.0.

## Problem

Both SDKs are already feature-rich and well-tested, and users already pin them in production. The absence of a written contract means three things go wrong. Users pin pre-1.0 versions assuming a stability we never promised. Reviewers guess, case by case, whether a change is breaking. And the most prominent surfaces (Tool Router, MCP, the `experimental.*` namespace) are labelled inconsistently across the two SDKs, so "is this stable?" has no authoritative answer. A 1.0 is the place to make the promise explicit and to pay, once, for the breaking changes that make the promise honest.

## Scope

### In scope

- `@composio/core` and the TypeScript provider packages under `ts/packages/providers`.
- `composio` and the Python provider packages under `python/providers`.

### Out of scope

- The CLI family: `@composio/cli`, `@composio/cli-keyring`, `@composio/cli-local-tools`, `@composio/ts-builders`. These are not published for general npm use and ride a separate binary-release flow. They version on their own schedule, and nothing here makes them "1.0 stable" by association.
- Internal utility packages such as `@composio/json-schema-to-zod`. They version independently. The one exception is any symbol re-exported from core's public entrypoint: once core re-exports `jsonSchemaToZodSchema` or `dereferenceJsonSchema`, that symbol is part of core's stable surface even though the utility package keeps its own version.

## Stability tiers

Every public surface is either stable or experimental. There is no third state.

**Stable (frozen under semver):** `tools`, `toolkits`, `triggers` (including webhook verification), `auth_configs`, `connected_accounts`, `files`, core construction and config, the provider SPI, and the error base types.

**Experimental (exempt from semver):** everything reachable under the `experimental.*` namespace, which today means custom tools, custom toolkits, and the shared-connection ACL. Experimental surfaces can break in a minor release. The contract states this in one sentence so nobody pins a workflow to an experimental surface expecting 1.x stability. The experimental namespace is the escape valve that lets 1.0 ship without freezing surfaces we are still designing.

Two surfaces forced this decision into the open.

**Tool Router becomes stable before 1.0.** It is the most prominent feature in the SDK, yet it ships marked experimental on both sides today. Shipping the flagship with a "may break" label is the wrong message, so we stabilize the `tool_router` session contract (remove the experimental tag, lock the types) as pre-1.0 work rather than ship it as experimental. This is the most significant single work item the contract creates.

**MCP stays experimental at 1.0.** The audit found it genuinely in flux. Python's `mcp.get` and `mcp.update` carry no explicit return type (unlike `mcp.create`); the TypeScript provider hook `wrapMcpServers` is named in a deprecation message but does not exist; and both SDKs mount MCP at a path their own docstrings contradict. Freezing that surface would lock in a contract we already know is wrong. MCP graduates to stable in a later 1.x minor, which is allowed because adding a stable namespace is not a breaking change.

## The provider SPI is stable

Custom-provider authors subclass `BaseProvider` (and its agentic and non-agentic variants) and rely on the abstract method signatures to infer their tool return types. Those signatures are therefore part of the stable surface: changing them breaks every third-party provider silently. The contract freezes the provider SPI alongside the user-facing namespaces, and the `type_inference` checks (including the custom-provider case, currently skipped in CI) must cover it before 1.0.

## Generated client

Both SDKs are thin shells over a Stainless-generated client. TypeScript pins `@composio/client@0.1.0-alpha.74`, an alpha whose types leak into core's public surface; Python pins `composio-client==1.41.0` and had to re-declare `ConfigToolkit` after the client dropped it. We own the generated client, and we graduate it to a stable (>= 1.0) line before SDK 1.0, which in turn requires declaring the backend OpenAPI spec stable. Once the client is stable and semver-managed, re-exporting its types is allowed. The parity check records the expected client pin so a future client major cannot move the SDK's public types without someone noticing.

## Deprecation policy

Within the 1.x line a stable API can be deprecated but not removed. Deprecation means a compile-time annotation (TypeScript `@deprecated`) or a runtime `DeprecationWarning` (Python) that names the replacement. The earliest a deprecated stable API can be removed is the next major. A renamed or moved API is a special case of deprecation: it ships a forwarding alias to its new name, the alias is marked deprecated, and it lives for at least a full major (removed no earlier than the next major). Experimental APIs are not covered by this policy and can change in any minor. The mechanics of the 0.x-to-1.0 transition itself live in the migration decision record.

## Considered alternatives

- **Two independent per-language 1.0s, each with its own contract.** Rejected. The SDKs share one conceptual model and one backend; two contracts would drift and would force users who work in both languages to learn two sets of rules.
- **Synchronized version integers across npm and PyPI.** Rejected. The two release pipelines have different cadences and different generated-client pins, so a shared integer is a constant coordination tax with no user benefit. If a launch wants "both at 1.0.0 on the same day," that is a release-scheduling choice layered on top, not a policy baked into the contract.
- **Ship Tool Router as experimental at 1.0.** Rejected. It is the headline feature; a "may break" label on the thing we most want people to adopt undercuts the launch.

## FAQ

**Can a minor release add a new provider or a new namespace?** Yes. Additions are non-breaking. Removing or renaming one is not.

**Does "stable" mean the backend API is frozen?** No. It means the SDK's public surface is frozen. The SDK absorbs additive backend changes; it shields users from them. A breaking backend change is the backend's problem to coordinate, and it must not reach the stable SDK surface inside a 1.x release.

**Why exclude the CLI?** It already releases on a separate flow and serves a different audience. Coupling its lifecycle to the SDK contract would slow both. It can reach its own 1.0 when it is ready.

**Is `experimental.*` a dumping ground?** It is the opposite: it is the named place where instability is allowed, so the rest of the surface can be trusted. An API leaves `experimental.*` only when we are ready to freeze it.
