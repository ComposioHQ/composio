---
name: cli-binary-size
description: Measure and reduce what the Composio CLI executable and its release downloads weigh, against the Bun runtime floor - size reports per target, Bun --trim and --aot builds and their blockers, archive formats, distribution options, and alternative runtimes or compilers such as Perry. Use when asked why the CLI binary is large, to shrink its download or install, or to judge a build flag, Bun upgrade, bundle change, or runtime swap by size or startup time. Do not use for publishing binaries (cli-release) or command implementation (cli-command).
---

# CLI Binary Size

The standalone `composio` executable is a Bun single-file executable, so most of it is the Bun runtime, not the CLI's code. Measure that floor before crediting any change with a size difference.

Read `references/experiments.md` before trying a build mode, Bun version, compiler, or runtime: it records what was already measured and what broke.

## Measure first

1. Run `pnpm --filter @composio/cli size:report` (`scripts/size-report.ts`; `--all` for every target, `--json` for data). It compiles a one-line program with the release flags (the floor, what Bun alone weighs) and the CLI, and reports the executable, the CLI's share of it (executable minus floor), companion modules, installed footprint, zip, `.tar.xz`, and the latest stable release's zip.
2. Measure what users get: the download per target and the installed footprint, against the last release. An unchanged executable does not mean an unchanged download: companions ship next to it.
3. Credit a change with a size difference only after running the report on its base and its branch with the same Bun version and flags. A build mode that removes a fixed amount (plain `--trim`) gives the same saving on any code.
4. If the goal is below the floor, say so before trimming code, and look at distribution options (below) and the Bun version instead.

## Build the way the release does

Every executable is compiled by `compileExecutable` in `scripts/_shared.ts` (`executableBuildArgs` holds the flags). Experiment through it, or with the same flags; a hand-written `bun build --compile` measures a different build. `test/src/scripts/executable-build-paths.test.ts` fails on a `--compile` flag in any other tracked file except documentation and vendored code.

## Diagnostics that stop at the first failure

Bun's `--explain=trim` (with `--aot --trim`) names only the first site its analysis cannot follow; fixing it moves the report to the next one. Before rewriting a dependency to clear blockers:

- Patch every reachable blocker with a throwaway `Bun.build` plugin (`onLoad` rewrites), rebuild until the report is clean or the remaining sites are inside Bun itself, and measure the size then.
- Tie each blocker to the build mode and the number it changes. A blocker that only matters under `--aot` does not explain the shipped size.

## Shipping changes

- Changing what a release archive contains affects `composio upgrade` on released clients: keep placeholders for paths they check, as `ts/packages/cli/AGENTS.md` describes, and prove it with `pnpm run test:upgrade-from-release --archive <zip> --to <tag>`, which upgrades the latest stable release to the archive. Use `cli-release` for the release itself.
- A build mode without the Bun command line (`--trim`, `--aot`) breaks anything that re-executes the CLI as Bun (`BUN_BE_BUN`).
- Startup time is part of the trade: `--bytecode` adds about 10.5 MiB and cuts `--version` from 119 ms to 47 ms.

## Options beyond the executable

When the floor dominates, compare these before trimming code:

- archive format (`.tar.xz` is about a third smaller than zip)
- a newer Bun with `--trim` (and `--trim-locales` on Linux)
- downloading a pinned runtime once and shipping only the bundle per release, or using a Node.js or Bun the user already has
- engine replacements (Perry, Node single-executable apps, Deno compile, small engines), checked on the compiled binary: `composio run`, a logged-in command such as `search`, and `upgrade`

Append every new measurement to `references/experiments.md`: date, Bun or compiler version, target, build mode, numbers, and what broke.
