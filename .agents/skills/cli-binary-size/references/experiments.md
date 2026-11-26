# CLI binary size experiments

Measurements of the standalone `composio` executable, newest first. All sizes are darwin-arm64 unless a row says otherwise. MiB is 1024², MB is 1000². Add a dated entry for every new measurement, including the ones that did not help.

## How to reproduce

- Size report: `pnpm --filter @composio/cli size:report [--all] [--json]`.
- Bun canary without installing it: download `https://registry.npmjs.org/@oven/bun-<platform>-<arch>/-/bun-<platform>-<arch>-<version>.tgz` (find canary versions with `npm view @oven/bun-darwin-aarch64 versions`), extract it, and call `package/bin/bun`. Check `bun build --help` for `--trim`, `--aot`, `--explain` and `--trim-locales`; the pinned Bun in `mise.lock` may not have them.
- `Bun.build` takes the same modes as `compile: { outfile, target, trim, aot, aotExplain: 'trim' }`; the trim report arrives in `result.logs`.
- Perry, an unsigned third-party compiler, so only in a disposable VM or container: `gh release download v0.5.1665 -R PerryTS/perry -p 'perry-macos-aarch64.tar.gz*'`. `shasum -a 256 -c` against the release's own checksum file catches a corrupt download, not a tampered release. Compile the fully minified release bundle (`perry compile <bundle.js> --platform bun`).

## 2026-11-26 — size report on `next`, Bun 1.4.4

| Floor (Bun alone) | Executable | CLI code | Companions | Installed | Zip      | .tar.xz  | 0.6.4 release zip |
| ----------------- | ---------- | -------- | ---------- | --------- | -------- | -------- | ----------------- |
| 85.0 MiB          | 87.2 MiB   | 2.2 MiB  | 11.1 MiB   | 98.3 MiB  | 41.5 MiB | 26.6 MiB | 41.6 MiB          |

The CLI's own code is about 2.5% of the executable. The companions are the TypeScript compiler (`generation-runtime.mjs`, about 9.9 MiB) and the `composio run` helpers (about 1.2 MiB).

## 2026-11-26 — Bun canary 1.4.6, with `composio run` running in-process

Bun canary `@oven/bun-darwin-aarch64@1.4.5-canary.20261125.1` (`bun --revision`: `1.4.6-canary.1+0966e99d8`). Built from the change in https://github.com/ComposioHQ/composio/pull/5587, where `composio run` executes scripts in an embedded interpreter instead of re-executing the CLI as Bun, and no code loads from disk. The `--aot` rows also used a build plugin that stops zod from generating code at runtime; that plugin changes nothing without `--aot`.

| Build                                        | Hello world | CLI     |
| -------------------------------------------- | ----------- | ------- |
| Bun 1.4.4 (pinned)                           | 85 MiB      | 88 MiB  |
| canary, no trim                              | 132 MiB     | 135 MiB |
| canary `--trim`                              | 67 MiB      | 70 MiB  |
| canary `--trim --trim-locales=en`, linux-x64 | —           | 81 MiB  |
| canary `--trim`, linux-x64                   | —           | 86 MiB  |
| canary `--aot --trim`                        | 23 MiB      | 97 MiB  |

- Plain `--trim` drops Bun's own tooling (installer, bundler, test runner), whatever the program does: Bun reported 67.4 MB trimmed for the CLI, and both programs lost about 65 MiB against the canary's untrimmed build. The untrimmed canary is larger than Bun 1.4.4, so against the pinned Bun the saving is 18 MiB.
- A trimmed or AOT executable has no Bun command line, so re-executing the CLI as Bun (`BUN_BE_BUN=1`, which `composio run` on `next` relies on) fails.
- `--aot --trim` trims almost nothing for the CLI. `--explain=trim` names one site at a time where its analysis gives up. Patching the sites in the first six items below with a throwaway `Bun.build` plugin (`onLoad` string rewrites) saved only 1.3 MiB (98.4 → 97.1 MiB); the last item lists what the report still named:
  - `effect/dist/Redactable.js`: `globalThis[currentFiberTypeId]` (a constant declared below its use); also in `internal/effect.js` and `http/UrlParams.js`
  - `effect/dist/internal/effect.js`: `process.getBuiltinModule("node:async_hooks")`
  - `@composio/client` `detectRuntime`: `globalThis` passed to callbacks from an array, then `versions[key]`
  - `@composio/core` `hasCustomGlobalDispatcher`: `globalThis[symbol]` over an array of symbols
  - `pusher-js/dist/node/pusher.js`: `f.call(context || global)` and its webpack CommonJS wrapper
  - `src/invocation/command-identity.ts`: `meta.hooks[hook]`, then calling the result
  - remaining, not fixable from the CLI: `crypto.randomUUID()` reported as `new Function`, `effect/dist/Data.js` `cases[value._tag](value)`, and sites inside Bun's own `node:repl` and `node:worker_threads`
- `@composio/core` was bundled twice, from `ts/packages/core/src` and `ts/packages/core/dist`.

## 2026-11-26 — Perry 0.5.1665, same branch

- Compiling the release-minified bundle with `--platform bun` took about 21 minutes and 10 GB of memory and produced a 96.7 MB executable, larger than Bun's.
- An unminified bundle miscompiles `semver` (`Comparator.parse` reads `re[t.COMPARATOR]` as undefined); full minification avoids it.
- Working: `--version`, `--help`, parse-error exit codes, `composio run` inline and `--file` (TypeScript, `fetch`, exit codes).
- Broken: logged-in commands (`search`) hang with no output; `Bun.spawn` throws "not supported by Perry" (`node:child_process` works).
- Startup 105 ms against 89 ms for the Bun build. A 15-line program using `child_process` and the network compiles to 13.1 MB.

## 2026-11-19 — startup and archives, Bun 1.4.4

Hyperfine medians, warm cache.

| Build                                | Size        | `--version` |
| ------------------------------------ | ----------- | ----------- |
| no bytecode                          | 87.2 MiB    | 119 ms      |
| `--bytecode`                         | 97.7 MiB    | 47 ms       |
| `--bytecode` with `--bytecode-order` | 97.7 MiB    | 47 ms       |
| `--bytecode-depth=1` / `0`           | 93 / 89 MiB | 59 / 80 ms  |

- `--compile-jit-policy` 2, 4 and 8 made no difference. `--no-compile-autoload-dotenv` saved about 5 ms.
- Where a bytecode `--version` spends its time: Bun runtime about 10 ms, `bin.ts` imports 11 ms, `cli-main` module init 16 ms, the command about 9 ms.
- The 102.4 MB bytecode executable: Bun 89.2 MB (JavaScriptCore and Bun machine code 76.7 MB), 2.3 MB of minified JavaScript, 10.9 MB of bytecode (about 4.7× the JavaScript).
- Archives of that executable alone: zip 46.8 MB, `zstd -19` 34.7 MB, `xz -9e` 30.1 MB.
- Marking `@composio/core` external shrank the JavaScript from 2.31 to 1.59 MB and the executable from 102.4 to 99.6 MB.
- Bun 1.4.5-canary.1: `--aot` started in 28–30 ms at 88 MiB, but could not act as Bun or load companion modules from disk; bytecode builds got worse (144 MiB, 51 ms).
- Perry 0.5.1665: 77 MB, 8-minute build, 100–120 ms startup; network requests hung and `composio run` could not load its companion modules.
