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

v3's `autoCorrectLimit` and `isCaseSensitive` have **no v4 config field**:

- The parser always computes "Did you mean?" suggestions internally
  (`internal/auto-suggest.ts`) and bakes them into `CliError.UnrecognizedOption` /
  `CliError.UnknownSubcommand`'s `message` getter. There is no parser switch to disable
  them.
- v4's parser performs no case-folding anywhere — flag/subcommand matching is always
  exact, so case-sensitivity needs no config.

## The custom `CliOutput.Formatter` (suggestion stripping)

Since suggestions can't be disabled at the parser, Composio suppresses them at render
time by overriding the `CliOutput.Formatter` service — the only public seam
`Command.runWith` reads before rendering. `ts/packages/cli/src/cli-config.ts`:

```ts
const withoutSuggestions = (error: CliError.CliError): CliError.CliError => {
  switch (error._tag) {
    case 'UnrecognizedOption':
      return error.suggestions.length === 0
        ? error
        : new CliError.UnrecognizedOption({ ...error, suggestions: [] });
    case 'UnknownSubcomand':
      return error.suggestions.length === 0
        ? error
        : new CliError.UnknownSubcommand({ ...error, suggestions: [] });
    default:
      return error;
  }
};

export const ComposioCliOutputFormatter: CliOutput.Formatter = (() => {
  const base = CliOutput.defaultFormatter();
  return {
    ...base,
    formatCliError: error => base.formatCliError(withoutSuggestions(error)),
    formatError: error => base.formatError(withoutSuggestions(error)),
    formatErrors: errors => base.formatErrors(errors.map(withoutSuggestions)),
  };
})();
```

Provided as a layer in `cli-main.ts`: `CliOutput.layer(ComposioCliOutputFormatter)`.
Note the upstream typo `UnknownSubcomand` (missing the second `m`) — match it exactly,
it is the real `_tag` in the installed types, not a mistake to "fix".

## `runWith` and the no-double-print rule

v4's `Command.runWith` is not a passive parser: it **renders help and parse/validation
errors itself** (`Console.log`/`Console.error`, via whichever `CliOutput.Formatter` is
in context) for the resolved `commandPath`, then re-fails with `CliError.ShowHelp`. By
the time that failure reaches an outer catch, the correct output has already been
printed once, to the correct stream. `ts/packages/cli/src/cli-main.ts`'s outer handler
for `CliError.ShowHelp` therefore does **nothing but derive the exit code**:

```ts
Effect.catchIf(
  (error): error is CliError.ShowHelp => CliError.isCliError(error) && error._tag === 'ShowHelp',
  error =>
    Effect.sync(() => {
      process.exitCode = error.errors.length > 0 ? 1 : 0;
    })
),
```

This mirrors `Runtime.errorExitCode` already encoded on `ShowHelp` (0 for bare
`--help`/`--version`, 1 when shown alongside real parse errors). If you add rendering
in this branch, you will double-print — this is the single most important rule when
touching the runner. The separate catch-all defect handler further down (genuine
command-handler failures captured via `effect-errors`) is a different path that
`Command.runWith` never renders, so appending help text there is not a double-print.

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
