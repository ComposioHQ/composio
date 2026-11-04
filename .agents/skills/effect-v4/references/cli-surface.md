# Effect CLI in this repository

The framework lives in `effect/cli`. The installed `effect@^4.1.0` typings determine which interfaces compile. The CLI's registration and invocation modules determine how the repository uses them.

## Command registration

A command definition declares flags, arguments, descriptions, examples, and its imported handler. A handler accepts a plain params type and returns an Effect. The [contributor guide](../../../../ts/packages/cli/CONTRIBUTING.md) follows a filter through this structure.

Every group uses `withRegisteredSubcommands` from `src/commands/registration.ts`. This helper supplies command identity and enforces inherited login metadata and supported shared flags. Calling `Command.withSubcommands` directly bypasses that behavior.

The following is the current connections group.

```ts no-check repo-file=ts/packages/cli/src/commands/connections/connections.cmd.ts
import { withCommandMeta } from 'src/invocation/command-identity';
import { Command } from 'effect/cli';
import { connectionsCmd$List } from './list/connections.list.cmd';
import { connectionsCmd$Remove } from './remove/connections.remove.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

export const rootConnectionsCmd = Command.make('connections').pipe(
  Command.withDescription('Inspect and remove connected toolkit accounts.'),
  withRegisteredSubcommands([connectionsCmd$List, connectionsCmd$Remove]),
  withCommandMeta({ requiresLogin: true })
);
```

The registration supplies its command path after parsing. Root shortcuts can reuse the same definition with different command paths. `withCommandMeta` declares login requirements, invocation hook policy, telemetry family, and unsupported dev shared flags. The selected handler begins after parsing, then runs its enabled hooks, records the invoked event, rejects unsupported flags, and checks login.

`CommandSurface` supplies root/dev context and dev shared flags. `actingUser()` resolves the acting user and project together. Handlers use these helpers instead of repeating user or project fallback rules. [ADR 0001](../../../../ts/packages/cli/docs/adr/0001-command-identity-after-parse.md) records the identity decision.

## Flags and arguments

Named options use `Flag.String`, `Flag.Boolean`, `Flag.Int`, `Flag.Literals`, or `Flag.Directory`. Positionals use `Argument.String`. Constructors use capital letters, while combinators use lowercase names. `Argument.variadic()` must be called when it is piped.

This standalone framework example demonstrates an optional flag and a positional argument.

```ts
import { Argument, Flag } from 'effect/cli';

export const toolkit = Argument.String('toolkit');
export const query = Flag.String('query').pipe(Flag.withDescription('Text search'), Flag.optional);
```

Optional flags produce `Option` values. Defaults, aliases, and descriptions belong in the declaration so help and parsing agree.

## Builtins, help and version

`src/cli-config.ts` enables the repository's Help and Version actions. Both wrap framework actions to record command identity without running a selected handler.

```ts no-check repo-file=ts/packages/cli/src/cli-config.ts
import { Help, Version } from 'src/commands/root-help';
import type { CliConfig } from 'effect/cli';

// Help and version use the framework parser, wrapped to record the command they answer for. The
// help formatter keeps version output bare.
export const ComposioCliConfig = {
  builtIns: [Help, Version],
} satisfies Partial<CliConfig.CliConfig.Service>;
```

`src/commands/root-help.ts` defines `helpFormatter()`. It starts from `CliOutput.defaultFormatter()`, keeps version output bare, and appends the root overview. `src/commands/index.ts` provides it as `CliOutput.Formatter`. Suggestions remain the framework's own.

`--version`, `-v`, and `composio version` print the version without a command-name prefix. A subcommand also accepts the version builtin. There is no version-token rewrite. The CLI declares its own log-level flag, while wizard and completion builtins are not enabled.

## Invocation and output

`Command.runWith(rootCommand, { version })` receives argv without the executable and script prefix. `runInvocation` receives full argv. `runWithConfig` removes the first two entries immediately before dispatch.

Compatibility normalization in `src/commands/argv-compat.ts` handles script tails for `run` and bare `listen --stream`. Effect still owns parsing. New command behavior does not need another argv parser.

`Command.runWith` renders help and parse failures before failing with `CliError.ShowHelp`. Explicit help and version use stdout. Implicit command help and errors use stderr. A parse failure has an exit code of 1 and records the canonical command path with reason `parse_error`. Help, version, parse failures, and groups that only show help skip selected-command hooks.

A reported failure carries `[Runtime.errorReported] = false`, which suppresses another print. `[Runtime.errorExitCode]` supplies its code. `runInvocation` reports an unreported expected failure or defect once and preserves the original cause for tests. `forRunner` marks what was printed before the runner exits through `Runtime.defaultTeardown`.

The runner owns signals. Commands cooperate through `ShutdownSignal`. A stopped subscribed listener exits 0. `run` preserves its child's code or signal. Other interrupted commands exit with 128 plus the signal number. Commands do not assign `process.exitCode` or install signal handlers.

## Verification

`bun run validate:cli-skills` checks linked excerpts against source, compiles standalone snippets and the CLI tests, runs the documented command example and existing invocation contracts, then checks Effect diagnostics. Its linked examples and behavior tests are described in the `cli-command` skill's command-example reference. These checks certify the examples and selected contracts, not an agent's ability to solve an unseen task.
