---
status: accepted
---

# Command identity is recorded after parse

The CLI needs to know which command an invocation runs, for telemetry, hooks, and login checks. We learn it at runtime, after effect/cli parses argv, instead of guessing it from argv up front. Each command registration passes its children an immutable command path and inherited command metadata; only the selected handler records the identity. Parse failures take the command path from `CliError.ShowHelp.commandPath`; `--help` and `--version` take it from the Help and Version action wrappers.

Identity describes the command registration, not the `Command` value. `link` is one value registered twice (`link` and `dev connected-accounts link`), so the same value has two command paths and must report the one the user ran.

## Considered Options

- **Runtime identity after parse (chosen).** effect/cli already resolved the command; we read its answer.
- **Static resolution of argv before parse.** `Command.Any` does not expose its flags, so this means reimplementing the parser: value flags, boolean literals, `--no-x`, shared and global flags, `--`. It keeps hand-kept value-flag tables that drift from the commands, and it knows less about a parse failure than `ShowHelp` does.
- **Hybrid (static first, runtime to confirm).** Two implementations of one question, and events from the same invocation can be attributed to different command paths.
- **Observer `GlobalFlag` action.** Runs only when its flag is present on argv, so it cannot see most invocations.

Industry practice agrees: gh, the Stripe CLI, cobra and commander based CLIs, Turborepo, and Vercel record the command after parse. oclif is the outlier; its `init` hook runs before command lookup.

- gh: https://github.com/cli/cli/blob/trunk/pkg/cmdutil/telemetry.go
- Stripe CLI: https://github.com/stripe/stripe-cli/blob/master/pkg/cmd/root.go
- cobra (`PersistentPreRun` never runs for unknown commands): https://github.com/spf13/cobra/blob/main/command.go
- commander (`preAction` runs after a valid parse): https://github.com/tj/commander.js/blob/master/lib/command.js

## Consequences

- Telemetry path and family come from identity, so the argv token tables and family matchers in `src/analytics/events.ts` go away. Only paths that were misattributed change.
- Parse failures still emit the invoked and failed pair, so current dashboards keep working. The path comes from `ShowHelp`, uses canonical command names, never raw user tokens, and the reason is `parse_error`. A separate rejected event (as the Stripe CLI does) was considered and deferred; adopting it means migrating funnels on purpose.
- The design depends on the order in which effect/cli (`effect` 4.0.5, the version the workspace locks) composes handlers in `withSubcommands`, which is undocumented. A contract test (`test/src/commands/registration.test.ts`) pins it (nested providers, guards, bare groups, reused registrations, root shortcuts), so an `effect` upgrade that changes it fails there first.
- Group-level guards such as `requireLogin` can run before the selected handler, so they would fire without an identity. They become command metadata, enforced right after identity is recorded.
- Hooks that ran before parse (update notice, plugin hint) run only for a selected command, so `--help`, `--version`, and typos no longer show them.

## Revisit when

- effect/cli ships a public hook for the selected command, such as an upstream `runWith({ onSelected })`.
- `CliOutput.Presenter` (https://github.com/Effect-TS/effect/pull/6743, merged but unreleased) ships; it can replace the Help, Version, and `ShowHelp` adapters for help, version, and parse-failure identity.
