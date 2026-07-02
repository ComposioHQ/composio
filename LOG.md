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
