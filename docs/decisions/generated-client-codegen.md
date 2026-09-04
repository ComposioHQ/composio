# Generated Client Codegen: Stainless to Hey API

## Decision

We replace Stainless with Hey API as the generator for the two private repositories that produce our HTTP clients: `composio-base-ts`, which publishes `@composio/client` (the client `@composio/core` pins), and `composio-base-py`, which publishes `composio-client` (the client `composio` pins). The deterministic automated-PR pipeline Stainless gave us stays; only the generator underneath it changes.

The shape we keep, in order: a GitHub Action fetches the backend OpenAPI schema, commits it into the repo as `openapi/openapi.yaml`, generates the client from that committed file, runs lint, typecheck, tests, and build, and opens a PR only when the generated diff is non-empty. A human reviews the PR, merges it, and the existing release automation publishes to npm and PyPI. How we cut releases does not change.

Two rules make the switch safe rather than merely cheap. We generate from the committed spec, never from the remote URL during a normal run, so a reviewer reads the schema diff and the generated-code diff in one place. And we never expose Hey API's generated surface as the public SDK contract: the generated code lives under `src/generated/` and a hand-written wrapper is what users import.

## Problem

The stability contract already commits us to a promise we cannot fully keep today: that we own the generated client. We own the repositories, but not the generator. Stainless is a closed, hosted service, so the one component that fixes the shape of every public type in both SDKs sits with a vendor we cannot fork, self-host, or pin at the source. The same contract requires graduating the client to a stable (>= 1.0) line before SDK 1.0, and a stable line we control needs a codegen path we control end to end.

We already patch around the generated output instead of shaping it. The Python client retried non-idempotent writes by default, so `tools.execute()` and `tools.proxy()` could send an email twice on a retry until we routed them through a no-retry clone; the TypeScript client is an alpha whose types leak straight into core's public surface. Owning the generator is the missing half of owning the client. We want that generator to be open source, self-hosted, and quick to adopt, and Hey API meets all three.

## Scope

### In scope

- `composio-base-ts`, the repository that generates and publishes `@composio/client`.
- `composio-base-py`, the repository that generates and publishes `composio-client`.
- The codegen configuration, the committed spec, and the scheduled update workflow in each of those two repositories.

### Out of scope

- The public SDK surface in this monorepo. `@composio/core` and `composio` keep their wrappers, and the generator swap must not move a single public type they expose. That invariance is the whole reason we wrap the generated surface.
- Release automation. TypeScript Changesets on merge to `next` and Python tag-triggered PyPI builds stay exactly as they are, and the update workflow never publishes.
- The backend OpenAPI spec itself. We consume it; declaring it stable is a separate step the stability contract already tracks as a prerequisite for a stable client line.

## Generate from a committed spec, not the URL

The generator reads `openapi/openapi.yaml` checked into the repo, and the workflow commits both that file and its `openapi/openapi.sha256` into the PR it opens. Generating from the live URL at build time would produce PRs that carry code changes with no schema diff to explain them, and it would make the output impossible to reproduce from the branch a reviewer is looking at. Committing the spec first gives the review its two halves: what the backend changed, and what that change did to the client. It also makes every regeneration deterministic, because the input is a file in git rather than whatever the URL served that minute.

## Wrap the generated surface, never expose it raw

Generated names change when the schema changes, and Hey API is explicit that its packages are in initial development, so its output shape can shift between generator versions too. The stability contract freezes the public SDK surface at 1.0, and those two facts collide the moment a generated identifier is re-exported unchanged. So the generated code stays under `src/generated/` (never hand-edited), and a stable wrapper (`src/client.ts` in TypeScript, `client.py` and `__init__.py` in Python) is the surface users depend on. The wrapper absorbs a renamed operation or a reshaped model without the churn reaching a user's import. This is also what makes the generator replaceable: because nothing public points at the generated names, the layer beneath the wrapper can move again later without a breaking change.

## TypeScript first, Python second

`@hey-api/openapi-ts` is the mature path, and `@hey-api/openapi-python` is younger, so we prove the TypeScript pipeline end to end before we touch Python. TypeScript starts on the Fetch client unless the current public contract turns out to need Axios-specific behavior. Once the TypeScript migration is reviewed, merged, and running on its scheduled workflow, we repeat the pattern for Python, and we treat Python as the higher-risk half until its generated output and its conformance tests say otherwise rather than assuming its naming or package layout is stable.

## The composition risk is the real risk

Composio's schema uses `oneOf` and `anyOf`, and successful codegen does not guarantee correct user-facing types for either. A migration PR is not acceptable because "the generator ran." It is acceptable when conformance tests, run against mocked HTTP responses, cover the hard parts of the schema: discriminated `oneOf`, non-discriminated `oneOf`, `anyOf` with overlapping object shapes, nested `allOf` combined with `oneOf`, nullable object fields, `additionalProperties` maps, enums including unknown-value behavior, arrays of union types, multipart and binary upload/download, structured error responses, and auth-required versus auth-optional operations. These tests are the gate, and they are written before the Stainless output is deleted, not after.

## Transformers stay off in the first pass

Hey API's transformer plugin documents three limitations that matter here: it does not transform union types, it transforms only `$ref` types, and it skips error responses. Our schema is union-heavy, so a transformer that silently leaves unions untouched is worse than no transformer, because it looks like coverage and is not. The rollout is phased for this reason. Phase one generates types and the SDK on both languages. Phase two adds the wrappers and the conformance tests. Phase three considers Zod or equivalent validators only after the generated SDK is accepted. Phase four considers transformers only after tests prove each case they would touch.

## The pipeline stays deterministic

Stainless-like determinism is a feature we keep on purpose, so the rules are explicit.

- Commit `openapi/openapi.yaml` and `openapi/openapi.sha256` in every generated PR.
- Pin the Hey API generator to an exact version; the docs advise it because the packages are still in initial development.
- Pin Node.js (22 or newer) and the package manager through the lockfile.
- Derive the PR branch from the schema SHA (`heyapi/openapi-<short-sha>`), so re-running on the same schema updates one branch instead of opening a second PR.
- Never combine a generator-version bump and a schema update in the same PR; they get separate PRs so a reviewer can attribute every diff to one cause.
- Keep a CI check that regenerates and fails when `git diff` is non-empty, so the committed generated code always matches the committed schema.

If the OpenAPI URL returns nondeterministic key ordering, a normalization step is allowed, but it must not dereference or flatten the schema. Flattening changes how `oneOf`, `anyOf`, discriminators, and `$ref`-based models generate, which is exactly the surface we are trying to hold steady.

## Considered alternatives

The selection criteria were open source, self-hostable, idiomatic per-language output, and quick to adopt without rebuilding the pipeline.

- **Stay on Stainless.** Rejected. It is closed and hosted, so it fails the first two criteria outright and blocks the "we own the client" promise the stability contract depends on.
- **OpenAPI Generator.** Rejected as the primary generator because its templated, many-language output is less idiomatic per language than what Hey API produces. We keep it as the fallback comparator for any schema area where Hey API misgenerates.
- **Fern.** Rejected. Its full generation flow leans on a hosted platform, which reintroduces the ownership problem we are leaving Stainless to solve.
- **Kiota.** Rejected. Its single unified client model fits our per-language idiomatic wrapper approach less cleanly than Hey API's separate TypeScript and Python generators.
- **Expose Hey API's generated surface directly as the public SDK.** Rejected. Generated names move with the schema and with generator versions, and the 1.0 contract freezes the public surface; wrapping is what lets the generator change without breaking a user's import.
- **Generate from the remote URL at build time.** Rejected. It produces code diffs with no committed schema diff to explain them and makes regeneration irreproducible from the branch.

## Fallback

If Hey API fails on a critical OpenAPI feature, the generator is the only layer we swap. We keep the wrapper structure, isolate the failure to specific schemas or operations, check whether a better discriminator or a semantics-preserving normalization fixes it without changing API meaning, file a minimal reproduction upstream, and fall back to OpenAPI Generator for the failing language or schema area. The deterministic PR architecture is not the part at risk; the generator is a replaceable part precisely because the wrapper hides it.

## FAQ

**Does this change what users import?** No. The wrapper is the public surface, and holding it invariant across the generator swap is the point. A user upgrading through this migration should see no change to `@composio/core` or `composio`.

**Does it change how releases happen?** No. The update workflow only opens PRs. Publishing stays tied to merge and release, so a schema change never auto-ships to npm or PyPI.

**Why not one workflow that fetches, generates, and publishes?** Because that couples a scheduled fetch to a release. Keeping publish on the existing merge and tag flow means a human reviews every schema-driven change before it reaches users.

**What about the parity check's recorded client pin?** The cross-SDK parity policy records the generated-client pin pair and fails when one side moves and the other does not. The generator swap does not touch that mechanism; it only changes what produces the pinned artifact.

**Why not enable transformers now for nicer types?** Because Hey API's transformer skips unions and error responses today, and our schema is union-heavy, so it would look like coverage while leaving the hardest types untransformed.
