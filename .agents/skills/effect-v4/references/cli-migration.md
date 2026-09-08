# Effect v4 CLI migration

Read this before translating `@effect/cli` commands. The v4 CLI lives under `effect/unstable/cli`, so even minor beta upgrades may change it.

## High-traffic mapping

| Effect v3                     | Effect v4 beta                                                           |
| ----------------------------- | ------------------------------------------------------------------------ |
| `@effect/cli/Command`         | `effect/unstable/cli/Command`                                            |
| `@effect/cli/Options`         | `effect/unstable/cli/Flag`                                               |
| `@effect/cli/Args`            | `effect/unstable/cli/Argument`                                           |
| `@effect/cli/ValidationError` | `effect/unstable/cli/CliError`                                           |
| `@effect/cli/BuiltInOptions`  | `effect/unstable/cli/GlobalFlag`                                         |
| `Command.run(command, cfg)`   | `Command.runWith(command, cfg)`; `Command.run` now reads argv from Stdio |

The runner config also changes shape: v4 `run` and `runWith` take `{ version, renderErrors? }`, so the v3 `{ name, version }` literal no longer type-checks. Earlier v4 betas exposed `Command.withHidden` and a `hidden` property; the pinned beta renamed them to `Command.unlisted` and `unlisted`. V3 `@effect/cli` has no per-command hidden flag, so Composio's `visibility` map in `src/commands/index.ts` is what ports to `Command.unlisted`.

`CommandDescriptor` and `Usage` have no like-for-like replacement: the upstream map points toward completions APIs, and help and usage generation are internal. The descriptor accessors collapse to public fields on `Command.Command` (`name`, `alias`, `subcommands`, `description`, `shortDescription`, `examples`, `annotations`, `unlisted`). Composio inspects descriptors in `src/commands/command-introspection.ts`; treat that module as a redesign boundary, not a rename.

## Composio configuration and rendering boundaries

- V3 config sets `showBuiltIns: false`, `autoCorrectLimit: 0`, and `isCaseSensitive: true`. The current v4 `CliConfig` is a `Context.Reference` that exposes only `builtIns`; it has no corresponding suggestion-limit or case-sensitivity fields.
- V4 parser suggestions are produced internally with edit distance 2 (`internal/auto-suggest.ts`). Preserve Composio's no-suggestion contract with explicit tests and a deliberate output/parser adaptation; do not assume config parity.
- `builtIns` feeds both parsing and help. `GlobalFlag.BuiltIns` is `[Help, Version, Wizard, Completions, LogLevel]`; `builtIns: []` disables built-in parsing as well as hiding built-ins from help. Preserving `--help`, `-h`, `--version`, and root `-v` while omitting other built-ins requires a reviewed built-in list or custom `GlobalFlag.action` entries.
- `Command.runWith` catches `CliError.ShowHelp`, always prints the help document to stdout (including for `--help`), prints parse errors to stderr, then re-fails. `renderErrors: false` suppresses only the stderr parse-error lines and the `CliError.UserError` rendering; it never suppresses help. Composio's outer renderer must therefore not print help again on `ShowHelp`, or the runner must be adapted so one owner renders help.
- `Command.runWith` accepts user arguments without executable prefixes. The current `bin.ts` reads `process.argv` once and threads the full argv (executable and script included) through `cli-main.ts` and the background-worker branch; strip the prefix at the runner boundary and keep the worker bypass ahead of parsing.

Inspect `CliConfig.ts`, `GlobalFlag.ts`, `CliOutput.ts`, `CliError.ts`, and the `runWith` implementation together before choosing the runner design.

## Command shape

```ts
import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

const execute = Command.make(
  'execute',
  {
    tool: Flag.string('tool').pipe(Flag.withDescription('Tool slug')),
    payload: Argument.string('payload').pipe(Argument.withDescription('JSON input')),
  },
  Effect.fn('cli.execute')(function* ({ tool, payload }) {
    yield* Console.log(`${tool}: ${payload}`);
  })
).pipe(Command.withDescription('Execute a tool'));

const root = Command.make('composio').pipe(Command.withSubcommands([execute]));

export const runCli = Command.runWith(root, { version: '0.0.0' });
```

## Behavior that needs explicit coverage

- Built-in and application-defined help/version flags, including aliases and collisions.
- Parent versus subcommand flags and how shared flags are inherited.
- Missing values, unexpected values, choice validation, repeated flags, and arguments beginning with `-`.
- `--` passthrough semantics.
- Root commands without handlers and subcommand help.
- Framework-rendered errors versus Composio's custom renderer; never render the same failure twice.
- stdout/stderr separation, non-interactive output, and exit codes.

Inspect these upstream sources before deciding behavior:

- `ts/vendor/effect/packages/effect/src/unstable/cli/Command.ts`
- `ts/vendor/effect/packages/effect/src/unstable/cli/Flag.ts`
- `ts/vendor/effect/packages/effect/src/unstable/cli/Argument.ts`
- `ts/vendor/effect/packages/effect/src/unstable/cli/GlobalFlag.ts`
- `ts/vendor/effect/packages/effect/test/unstable/cli/`
- `ts/vendor/effect/ai-docs/src/70_cli/`

Use Uniku only as a porting precedent. Its argument preprocessing and small command tree are application-specific; transfer its golden-test discipline, not its workaround code.
