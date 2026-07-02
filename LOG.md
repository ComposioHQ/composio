# SDK v1 Goal Log

## 2026-07-03 - B9 parity guardrail

Selected blocker: B9, parity is not enforced in CI.

Hypothesis: A dependency-free root validator can close the first guardrail slice by checking the current TypeScript and Python public SDK surface, provider matrix, and generated-client pins, then running from both the TypeScript and Python CI workflows alongside the agent skill validators.

Files changed:

- `ts/scripts/validate-sdk-parity.mjs`
- `package.json`
- `.github/workflows/ts.test.yml`
- `.github/workflows/py.check.yaml`
- `LOG.md`

Commands run:

- `node ts/scripts/validate-sdk-parity.mjs`
- `pnpm run validate:sdk-parity`
- `pnpm run validate:agent-skills`
- `pnpm run validate:skill-routing`
- `git diff --check`

Result: Green. `validate:sdk-parity` now exists and checks normalized root namespaces, ten resource method surfaces, provider directories against the `cross-sdk-parity-policy.md` matrix, and the recorded generated-client pin pair. The validator currently passes with 28 declared current gaps; those allowances are stale-checked so closing a gap requires removing its allowance in the same PR. `ts.test.yml` and `py.check.yaml` now run `validate:sdk-parity`, `validate:agent-skills`, and `validate:skill-routing`.

Next blocker: Continue the low-risk release plumbing lane, starting with B1 provider peer ranges so TypeScript providers do not reject `@composio/core@1.x` during `check-peer-deps`.

## 2026-07-03 - B1 provider peer ranges

Selected blocker: B1, TypeScript provider peer ranges cap `@composio/core` at `<1.0.0`.

Hypothesis: Widening the provider peer range to `>=0.10.0 <2.0.0` keeps compatibility with the current core line, allows the 1.x stability line, and still blocks an unreviewed 2.x major.

Files changed:

- `ts/packages/providers/*/package.json`
- `.changeset/wide-provider-peer-ranges.md`
- `LOG.md`

Commands run:

- `pnpm run check:peer-deps`
- `command rg -n '>=0\.10\.0 <1\.0\.0|>=0\.10\.0 <2\.0\.0' ts/packages/providers/*/package.json`
- `node -e "const semver=require('semver'); for (const range of ['>=0.10.0 <2.0.0']) { if (!semver.satisfies('1.0.0', range) || !semver.satisfies('1.9.9', range) || semver.satisfies('2.0.0', range)) process.exit(1); } console.log('provider peer range accepts core 1.x and rejects 2.x')"`
- `pnpm run validate:sdk-parity`

Result: Green. All ten TypeScript provider packages now peer-depend on `@composio/core` with `>=0.10.0 <2.0.0`, and a patch changeset records the provider metadata update.

Next blocker: Continue the low-risk release plumbing lane with B7, pinning Python providers to `composio>=1.0,<2`.
