# Bumping the Effect v4 beta pin

Adapted from the pre-migration prep work's stop-conditions, updated for the fact the
cutover is now done: this is a beta-to-beta upgrade procedure, not a v3→v4 port.

## 1. Check `minimumReleaseAge`

`pnpm-workspace.yaml` sets `minimumReleaseAge: 4320` (minutes — 3 days) with an
explicit `minimumReleaseAgeExclude` list. `effect` and its satellite packages are
**not** on that exclude list, so a newly published beta must be at least 3 days old
before pnpm will resolve it. Check the target version's npm publish timestamp
(`npm view effect@<version> time.<version>`) against `now - 4320m` before touching any
pin — bumping too early makes `pnpm install` fail to resolve, not silently ignore the
constraint.

## 2. Bump the exact pins together

Every one of these must move to the same new exact beta in the same change — never
bump one and leave the others behind:

- `pnpm-workspace.yaml` catalog: `effect`, `@effect/platform-bun`,
  `@effect/platform-node-shared`, `@effect/vitest`.
- `ts/packages/cli-keyring/package.json`: its `effect` dependency is pinned exactly
  (not via `catalog:`) — bump it directly, in both `dependencies` and wherever else it
  is repeated in that file.
- Any other package pinning `effect` outside the catalog — grep for `"effect":` across
  `ts/packages/*/package.json` before assuming the catalog covers everything.

Keep every pin an exact version string (no `^`, no `@beta`, no range) — this matches
the existing convention, not a new rule.

## 3. Advance the vendored source oracle

`ts/vendor/effect` is a git submodule pinned at a commit on the canonical
`Effect-TS/effect` repo, currently
`6184a7dc53cb9310e299b65ad6d6c712c2cbf202` (tagged `@effect/ai-anthropic@4.0.0-beta.99`
at the time of writing — confirm with `git submodule status ts/vendor/effect`). Advance
it to the commit/tag matching the new npm version:

```bash
cd ts/vendor/effect
git fetch --tags
git checkout <tag-or-commit-matching-the-new-effect-version>
cd -
git add ts/vendor/effect
```

The submodule SHA and the npm version are two independent facts — record both, and
never treat "the vendored source moved" as license to bump the npm pin, or vice versa.
The vendored source is read-only: never edit it, never import runtime code from it.

## 4. Install and verify

```bash
pnpm install
pnpm typecheck
pnpm --filter @composio/cli test
pnpm --filter @composio/cli build
```

Also run the CLI's Docker-based end-to-end suite (see the repo-local `cli-e2e` skill)
before treating the bump as done — a green typecheck is necessary but not sufficient;
CLI parsing, help rendering, and error output can change between betas while types stay
valid. Cross-check any API you touch during the bump against the freshly-advanced
`ts/vendor/effect/packages/effect/src` and the installed `effect` typings, not against
what compiled under the old beta.

## Stop conditions

Pause instead of reaching for a workaround when:

- the required behavior only exists on unreleased upstream `main` (no matching
  published beta yet);
- CLI help, parsing, output, error-rendering, or exit-code contracts change and cannot
  be preserved with a like-for-like adaptation (see
  [cli-surface.md](cli-surface.md) for what "preserved" means here);
- a package this repo depends on (`@effect/platform-bun`, `@effect/platform-node-shared`,
  `@effect/vitest`) has no matching beta published yet for the target `effect` version;
- the CLI's Docker E2E checks regress and the cause traces to the new beta rather than
  to this repo's own code.
