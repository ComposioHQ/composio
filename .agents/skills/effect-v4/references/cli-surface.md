# effect/unstable/cli surface, as used in this repo

`@effect/cli` no longer exists. The CLI framework lives under `effect/unstable/cli`:
`Command`, `Flag` (was `Options`), `Argument` (was `Args`), `GlobalFlag` (was
`BuiltInOptions`), `CliConfig`, `CliOutput`, `CliError` (was `ValidationError`/
`HelpDoc`). Ground truth for this reference is
`ts/packages/cli/src/cli-config.ts` and `ts/packages/cli/src/cli-main.ts` — read their
full module docstrings before touching the runner, not just the excerpts below.

## Command shape

```ts
import { Command } from 'effect/unstable/cli';

export const rootToolsCmd = Command.make('tools').pipe(
  Command.withDescription('Browse and inspect tools before executing them.'),
  Command.withSubcommands([toolsCmd$List, toolsCmd$Info])
);
```

(`ts/packages/cli/src/commands/tools/tools.cmd.ts`, unchanged shape from v3 apart from
the import path — `Command.make`/`.withDescription`/`.withSubcommands` all carried over.)

Flags/arguments: `Flag.string/boolean/integer/choice/directory(...)` (was
`Options.text`/`.boolean`/`.integer`/`.choice`/`.directory`), with the same
`.withDescription`/`.withDefault`/`.withAlias`/`.optional` combinators. `Argument.string(name)`
takes a bare string name, not `{ name }`. Variadic: `Argument.variadic()` must be called
with parens when piped — the bare unapplied reference resolves to the wrong overload.

## `CliConfig.builtIns`

v4's `CliConfig.Service` shrank to one field, `builtIns` — the ordered list of active
global flags. `ts/packages/cli/src/cli-config.ts`:

```ts
export const ComposioCliConfig = {
  builtIns: [GlobalFlag.Help, GlobalFlag.Version],
} satisfies Partial<CliConfig.CliConfig.Service>;
```

This drops `--wizard`, `--completions`, and `--log-level` (Composio has its own
`--log-level` flag on the default command) — the v4 equivalent of v3's
`showBuiltIns: false`, scoped to exactly the two builtins Composio wants.

v3's `autoCorrectLimit` and `isCaseSensitive` have **no v4 config field**, and Composio no
longer reproduces either behavior:

- The parser always computes "Did you mean?" suggestions internally
  (`internal/auto-suggest.ts`) and bakes them into `CliError.UnrecognizedOption` /
  `CliError.UnknownSubcommand`'s `message` getter. There is no parser switch to disable
  them, and Composio deliberately renders them as-is now — they are useful UX, not a
  regression to work around.
- v4's parser performs no case-folding anywhere — flag/subcommand matching is always
  exact, so case-sensitivity needs no config.

`ComposioCliConfig`'s `builtIns` narrowing is the *only* `CliConfig` customization
Composio makes. There is no custom `CliOutput.Formatter` — `cli-main.ts` provides no
`CliOutput.layer(...)` at all, so `Command.runWith` uses v4's own
`CliOutput.defaultFormatter()` for everything: suggestions render, and `--version`
renders `<name> v<version>` (see the next section). An earlier revision of this file
wrapped `defaultFormatter()` to strip suggestions and flatten `formatVersion` back to a
bare semver; that formatter (`ComposioCliOutputFormatter`, `withoutSuggestions`) was
deleted as a deliberate PR-review decision — do not reintroduce it.

## `--version` renders v4's default banner; `composio version` is separate

`--version`/`-v` (the built-in global flag) now prints whatever
`CliOutput.defaultFormatter().formatVersion(name, version)` renders —
`` `${name} v${version}` `` (bold/dim colors when the output is a TTY), where `name` is
the root command's name (`'composio'`, from `Command.make('composio', ...)` in
`$default.cmd.ts`). This differs on purpose from the `composio version` *command*
(`src/commands/version.cmd.ts`), which is untouched and still prints the bare
`pkg.version`/`DEBUG_OVERRIDE_VERSION` via `ui.output()` for scripts and CI to parse.
Any script that needs a parseable version string must call `composio version`, not
`composio --version`.

## `runWith`, `ShowHelp`, and the no-double-print rule

v4's `Command.runWith` is not a passive parser: it **renders help and parse/validation
errors itself** (`Console.log`/`Console.error`, via whichever `CliOutput.Formatter` is
in context — v4's default, per above) for the resolved `commandPath`, then re-fails with
`CliError.ShowHelp`. By the time that failure reaches this package's runner, the correct
output has already been printed once, to the correct stream.

`CliError.ShowHelp` is not a plain tagged error — it carries two `effect/Runtime`
markers set on the class itself (`ts/vendor/.../unstable/cli/CliError.ts`):
`[Runtime.errorExitCode] = errors.length ? 1 : 0` and `[Runtime.errorReported] = false`.
Those markers *are* the contract: "I already printed my own output; don't log me again
(`errorReported`), and here is the process exit code to use (`errorExitCode`)."
`Runtime.makeRunMain` (which `BunRuntime.runMain`/`NodeRuntime.runMain` build on) reads
`errorReported` off the squashed cause to decide whether to auto-log, and
`Runtime.defaultTeardown` reads `errorExitCode` the same way — see
`ts/vendor/effect/packages/effect/src/Runtime.ts`'s `getErrorReported`/`getErrorExitCode`.

Consequently `ts/packages/cli/src/cli-main.ts` does **not** intercept `ShowHelp` to
derive an exit code by hand anymore. Its sandboxed catch-all handler special-cases
`ShowHelp` (via `CliError.isCliError(squashed) && Predicate.isTagged(squashed,
'ShowHelp')`, never a direct `._tag ===` check) and re-fails with the original `Cause`
via `Effect.failCause(cause)` instead of swallowing it like every other error — that lets
the failure reach `BunRuntime.runMain` untouched, where `errorReported`/`errorExitCode`
take over. The custom `teardown` in the same file reads `Runtime.getErrorExitCode` off
the squashed failure for exactly this case, falling back to `Number(process.exitCode ??
1)` otherwise. If you add rendering anywhere in this path, you will double-print — this
is the single most important rule when touching the runner. The separate catch-all
defect handler further down (genuine command-handler failures captured via
`effect-errors`) is a different path that `Command.runWith` never renders, so appending
help text there is not a double-print.

## argv preprocessing and the executable-prefix contract

`Command.runWith(rootCommand, { version })` expects argv **without** the node/bun
executable and script path prefix — unlike v3's `Command.run`, which stripped that
prefix internally. `cli-main.ts` still passes the _full_ `process.argv` into
`runWithConfig` (from `src/commands`); that module is responsible for slicing
`argv.slice(2)` immediately before calling `Command.runWith`. Do not change this
boundary without updating both sides together.

Composio also does argv rewriting _before_ the parser ever sees the tokens, for cases
`effect/unstable/cli`'s lexer cannot express on its own — e.g. `composio run`'s
passthrough of arbitrary `-`-prefixed tokens to the spawned script (the lexer treats
every `-`-prefixed token as an option unless a literal `--` precedes it, and that `--`
split does not propagate into subcommands). Look at `normalizeRunPassthroughArgs` and
its siblings (`normalizeListenStreamFlag`, `normalizeVersionShortFlag`,
`normalizeHiddenDebugFlags`) in `src/commands/index.ts` for the established pattern
before inventing a new one.
