# effect/cli surface, as used in this repo

`@effect/cli` no longer exists. The CLI framework lives under `effect/cli`:
`Command`, `Flag` (was `Options`), `Argument` (was `Args`), `GlobalFlag` (was
`BuiltInOptions`), `CliConfig`, `CliOutput`, `CliError` (was `ValidationError`/
`HelpDoc`). Ground truth for this reference is
`ts/packages/cli/src/cli-config.ts`, `ts/packages/cli/src/cli-main.ts`, and
`ts/packages/cli/src/invocation/invocation.ts` — read their full module docstrings before touching the runner, not just the excerpts below.

## Command shape

```ts
import { Command } from 'effect/cli';

declare const toolsCmd$List: Command.Command<'list', {}, never, never>;
declare const toolsCmd$Info: Command.Command<'info', {}, never, never>;

export const rootToolsCmd = Command.make('tools').pipe(
  Command.withDescription('Browse and inspect tools before executing them.'),
  Command.withSubcommands([toolsCmd$List, toolsCmd$Info])
);
```

(`ts/packages/cli/src/commands/tools/tools.cmd.ts`, unchanged shape from v3 apart from
the import path — `Command.make`/`.withDescription`/`.withSubcommands` all carried over.)

Flags/arguments: `Flag.String/Boolean/Int/Literals/Directory(...)` (was
`Options.text`/`.boolean`/`.integer`/`.choice`/`.directory`), with the same
`.withDescription`/`.withDefault`/`.withAlias`/`.optional` combinators. `Argument.String(name)`
takes a bare string name, not `{ name }`. Variadic: `Argument.variadic()` must be called
with parens when piped — the bare unapplied reference resolves to the wrong overload.

## `CliConfig.builtIns`

v4's `CliConfig.Service` shrank to one field, `builtIns` — the ordered list of active
global flags. `ts/packages/cli/src/cli-config.ts`:

```ts
import { GlobalFlag, type CliConfig } from 'effect/cli';

export const ComposioCliConfig = {
  builtIns: [GlobalFlag.Help],
} satisfies Partial<CliConfig.CliConfig.Service>;
```

This drops `--version` (see the next section), `--wizard`, `--completions`, and
`--log-level` (Composio has its own `--log-level` flag on the default command) — the v4
equivalent of v3's `showBuiltIns: false`, scoped to exactly the one builtin Composio wants.

v3's `autoCorrectLimit` and `isCaseSensitive` have **no v4 config field**, and Composio no
longer reproduces either behavior:

- The parser always computes "Did you mean?" suggestions internally
  (`internal/auto-suggest.ts`) and bakes them into `CliError.UnrecognizedOption` /
  `CliError.UnknownSubcommand`'s `message` getter. There is no parser switch to disable
  them, and Composio deliberately renders them as-is now — they are useful UX, not a
  regression to work around.
- v4's parser performs no case-folding anywhere — flag/subcommand matching is always
  exact, so case-sensitivity needs no config.

`ComposioCliConfig`'s `builtIns` narrowing is the _only_ `CliConfig` customization
Composio makes. There is no custom `CliOutput.Formatter` — `InvocationLive` provides no
`CliOutput.layer(...)` at all, so `Command.runWith` uses v4's own
`CliOutput.defaultFormatter()` for everything: suggestions render as-is. An earlier revision of this file
wrapped `defaultFormatter()` to strip suggestions and flatten `formatVersion` back to a
bare semver; that formatter (`ComposioCliOutputFormatter`, `withoutSuggestions`) was
deleted as a deliberate PR-review decision — do not reintroduce it.

## `--version`, `-v`, and `composio version` print the same bare semver

`GlobalFlag.Version` is not in `builtIns`. `src/commands/index.ts`'s
`normalizeVersionFlag` rewrites a leading `--version`/`-v` to the `version` command before
the parser runs, so all three spellings share `src/commands/version.cmd.ts`'s handler and
print the bare `pkg.version`/`DEBUG_OVERRIDE_VERSION` via `ui.output()`. v4's
`CliOutput.defaultFormatter().formatVersion` (`<name> v<version>`) is never reached: keeping
the built-in active would have let `composio <subcommand> --version` render that banner
instead, a second rendering of the same value. `composio <subcommand> --version` is therefore
an unrecognized flag, like any other unknown option.

## `runWith`, `ShowHelp`, and the no-double-print rule

v4's `Command.runWith` is not a passive parser: it **renders help and parse/validation
errors itself** (`Console.log`/`Console.error`, via whichever `CliOutput.Formatter` is
in context — v4's default, per above) for the resolved `commandPath`, then re-fails with
`CliError.ShowHelp`. By the time that failure reaches this package's runner, the correct
output has already been printed once, to the correct stream.

`CliError.ShowHelp` is not a plain tagged error — it carries two `effect/Runtime`
markers set on the class itself (`ts/vendor/.../cli/CliError.ts`):
`[Runtime.errorExitCode] = errors.length ? 1 : 0` and `[Runtime.errorReported] = false`.
Those markers _are_ the contract: "I already printed my own output; don't log me again
(`errorReported`), and here is the process exit code to use (`errorExitCode`)."
`Runtime.makeRunMain` (which `BunRuntime.runMain`/`NodeRuntime.runMain` build on) reads
`errorReported` off the squashed cause to decide whether to auto-log, and
`Runtime.defaultTeardown` reads `errorExitCode` the same way — see
`ts/vendor/effect/packages/effect/src/Runtime.ts`'s `getErrorReported`/`getErrorExitCode`.

The CLI's own errors use the same contract. A failure a command already printed
(`ReportedFailure` from `src/effects/report-failure.ts`, `ReportedToolExecutionError`,
`ShellSetupAbortError`, `SetupCommandError`, …) or that carries a custom code
(`ChildProcessExited` from `composio run`) declares the markers as getters, and
the CLI's runner (`ts/packages/cli/src/run-main.ts`, built on `Runtime.makeRunMain`) exits
through `Runtime.defaultTeardown`: 0 on success, and otherwise with the squashed failure's
`errorExitCode` (1 when unset). An exit made of interruptions alone after a signal is 128 + the
signal's number instead (130, 143, 129). Nothing in `src/` assigns `process.exitCode`.

`runInvocation` (`src/invocation/invocation.ts`) skips every failure whose `errorReported`
is false (`ShowHelp` included); when nothing is left it prints nothing. If you add rendering
anywhere in this path, you will double-print — this is the single most important rule when
touching the runner. It prints an expected failure's message, a rejected key's hint, or, for
whatever else is left, the defect report captured via `effect-errors`, then re-fails with the
original `Cause`, so tests still match the typed error. `forRunner` (in `cli-main.ts`'s
pipeline) turns what the invocation printed into a `ReportedFailure` and passes failures
already on screen untouched, so the markers take over. `Command.runWith` never renders the
defect path, so appending help text there is not a double-print.

## argv preprocessing and the executable-prefix contract

`Command.runWith(rootCommand, { version })` expects argv **without** the node/bun
executable and script path prefix — unlike v3's `Command.run`, which stripped that
prefix internally. `runInvocation` still passes the _full_ `process.argv` into
`runWithConfig` (from `src/commands`); that module is responsible for slicing
`argv.slice(2)` immediately before calling `Command.runWith`. Do not change this
boundary without updating both sides together.

Composio also does argv rewriting _before_ the parser ever sees the tokens, for cases
`effect/cli`'s lexer cannot express on its own — e.g. `composio run`'s
passthrough of arbitrary `-`-prefixed tokens to the spawned script (the lexer treats
every `-`-prefixed token as an option unless a literal `--` precedes it, and that `--`
split does not propagate into subcommands). Look at `normalizeRunPassthroughArgs` and
its siblings (`normalizeListenStreamFlag`, `normalizeVersionFlag`,
`normalizeHiddenDebugFlags`) in `src/commands/index.ts` for the established pattern
before inventing a new one.
