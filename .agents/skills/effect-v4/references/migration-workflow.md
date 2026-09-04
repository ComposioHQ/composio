# Effect v4 CLI migration workflow

Use this workflow for the Composio CLI port. Do not combine the whole migration into one mechanical rewrite.

## 1. Establish the baseline

- Record the current workspace catalog, CLI dependency graph, lockfile state, and `ts/vendor/effect` gitlink.
- Run the focused v3 checks before dependency changes:

```bash
pnpm --filter @composio/cli typecheck
pnpm --filter @composio/cli test
pnpm --filter @composio/cli build
pnpm test:e2e:cli
```

- Capture observable contracts for help and version flags, missing/invalid values, `--`, stdout/stderr separation, error rendering, exit codes, config, and representative command groups.

## 2. Inventory package consolidation

V4 consolidates many v3 packages into `effect` or `effect/unstable/*`. Inventory every direct CLI dependency before editing the catalog:

- `@effect/cli` moves to `effect/unstable/cli`.
- `@effect/platform` services move into `effect` or `effect/unstable/*`.
- `@effect/cluster`, `@effect/rpc`, `@effect/sql`, and `@effect/workflow` mostly move under matching unstable modules; driver packages that remain separate must match the exact core beta.
- `@effect/platform-bun` and `@effect/vitest` remain separate packages and must match the exact `effect` beta.
- Do not remove a v3 satellite until searches prove its imports have moved and the replacement compiles.

Use `ts/vendor/effect/MIGRATION.md` and `ts/vendor/effect/migration/v3-to-v4.md` as the primary rename map. Search the actual source for gaps; the map is not exhaustive.

## 3. Port in dependency order

1. Package pins and import surface.
2. Core services, layers, configuration, errors, and Schema models.
3. Command primitives: `Command`, `Flag`, `Argument`, descriptions, examples, subcommands, and shared/global flags.
4. Root runner, runtime services, help/error rendering, and exit codes.
5. Unit tests and shared test layers.
6. Binary and Docker E2E contracts.

Keep commits reviewable by subsystem. A green typecheck is necessary but not sufficient: CLI parsing and rendering can change while types remain valid.

## 4. Keep source and packages independent

The submodule is a source reference; the CLI runs npm packages. For every upgrade:

1. Verify the intended upstream gitlink is reachable from canonical `Effect-TS/effect`.
2. Record the submodule SHA and source manifest version.
3. Verify the exact beta exists for `effect` and every remaining Effect package.
4. Update package pins deliberately and regenerate `pnpm-lock.yaml` with pnpm.
5. Compile against installed packages. Never infer package compatibility from a newer source checkout alone.

## Stop conditions

Pause the port instead of reaching for snapshots or local patches when:

- required behavior exists only on unreleased upstream `main`;
- help, parsing, output, error, or exit-code contracts cannot be preserved;
- a required v3 satellite has no verified replacement;
- cross-platform binary or Docker CLI E2E checks regress.
