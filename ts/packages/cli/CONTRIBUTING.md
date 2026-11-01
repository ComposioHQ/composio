# Contributing to the CLI

The CLI keeps command declarations, behavior, and output in separate files. The [command catalog](src/commands/COMMANDS.md) maps each command registration to its help summary and source file. The catalog comes from the command tree and includes root shortcuts, login requirements, and hidden or experimental commands.

This guide follows `composio connections list --toolkit github` through its declaration, handler, and test. The [glossary](GLOSSARY.md) defines command trees, projects, acting users, and invocation outcomes. [AGENTS.md](AGENTS.md) contains the detailed implementation rules.

## Find the behavior to change

A command path identifies its registration in the CLI. The root tree acts on the logged-in person's consumer project. The dev tree acts on a developer project. A root shortcut can reuse a definition registered elsewhere, such as `link` and `dev connected-accounts link`.

The usual file layout places related code in one directory.

| File                        | Responsibility                                             |
| --------------------------- | ---------------------------------------------------------- |
| `<group>.<name>.cmd.ts`     | Declares arguments, flags, help, examples, and the handler |
| `<group>.<name>.handler.ts` | Composes the command's behavior as an Effect               |
| `<group>.<name>.format.ts`  | Formats output when the command needs a separate renderer  |
| `<group>.<name>.errors.ts`  | Defines command-specific failures when needed              |
| `<group>.cmd.ts`            | Registers the group's subcommands and shared metadata      |

Tests mirror this layout under `test/src/commands/`. A `.cmd.test.ts` exercises argv through the full invocation. A `.handler.test.ts` can exercise behavior without parsing arguments. Some commands still use the older single-file layout. A substantive change migrates one command at a time, as described in [the layout rules](AGENTS.md#command-module-layout).

## Follow a filter through `connections list`

The command lists the acting user's connected accounts as JSON, grouped by toolkit. The optional `--toolkit` flag limits the request to one toolkit. A change to that filter touches its declaration, handler, and argv-level test.

### The declaration defines the input

[connections.list.cmd.ts](src/commands/connections/list/connections.list.cmd.ts) contains the flag and passes the handler to `Command.make`. The following excerpt is the current flag declaration.

```typescript
const toolkit = Flag.String('toolkit').pipe(
  Flag.withDescription('Filter by toolkit slug (e.g. "gmail")'),
  Flag.optional
);
```

`effect/cli` parses named options through `Flag` and positionals through `Argument`. `Flag.optional` produces an `Option<string>`. Defaults and aliases also belong in the declaration, so parsing and help describe the same input.

The command file declares input and help. It contains no request logic or service lookups.

### The handler composes the behavior

[connections.list.handler.ts](src/commands/connections/list/connections.list.handler.ts) declares its own `ConnectionsListParams` type. Passing the handler to `Command.make` checks that the parsed input satisfies that type.

The handler performs five steps.

1. It resolves `TerminalUI`, the client factory, and the optional toolkit slug.
2. It resolves the acting user and project through `actingUser()`.
3. It gets a client scoped to that project's organization and project, then lists the user's accounts.
4. It decodes the response and resolves each account's permission group.
5. It formats the accounts and writes JSON through `TerminalUI.output`.

This excerpt shows the current request. The surrounding Effect has already resolved the client, toolkit slug, and consumer user id.

<!-- prettier-ignore -->
```typescript
const rawResult = yield* client.connectedAccounts
  .list(
    {
      toolkit_slugs: toolkitSlug ? [toolkitSlug] : undefined,
      user_ids: [consumerUserId],
      limit: 1000,
    },
    idempotent
  )
  .pipe(failedWith(ConnectionsListRequestError, 'Failed to list connections.'));
```

`yield*` runs an Effect within `Effect.gen`. A typed failure stops the remaining steps unless a combinator handles it. The `idempotent` option enables the CLI's retry policy for this read. Execution and proxy requests have different retry constraints.

The CLI uses native Effects from `@composio/client/effect`. [ComposioClientSingleton](src/services/composio-clients.ts) constructs clients with explicit credentials, project scope, HTTP transport, identity headers, and schema loaders. A handler gets its scoped client from that factory. It does not wrap native client calls in `Effect.tryPromise` or construct a second client.

The handler's dependencies come from Effect services. [InvocationLive](src/invocation/live.ts) supplies production implementations. `TestLive` supplies test implementations for the same invocation. This keeps filesystem access, HTTP requests, terminal output, and other dependencies replaceable in tests.

### The registration supplies shared behavior

[connections.cmd.ts](src/commands/connections/connections.cmd.ts) registers `list` through `withRegisteredSubcommands` and declares `requiresLogin: true` for the group. The selected command inherits that requirement. The handler does not repeat the login check.

Registration also supplies the command path used by invocation hooks and lifecycle telemetry. New groups use `withRegisteredSubcommands`, rather than calling `Command.withSubcommands` directly. [ADR 0001](docs/adr/0001-command-identity-after-parse.md) explains why identity comes from the parsed registration.

For dev commands, `CommandSurface` supplies the tree and shared flags. `actingUser()` resolves the user and project together. A handler does not recreate the fallback from an explicit `--user-id` to a directory or global test user. A `--user-id` used only to filter results remains a user filter.

### The argv-level test verifies the change

[connections.list.cmd.test.ts](test/src/commands/connections/list/connections.list.cmd.test.ts) runs `cli(['connections', 'list', '--toolkit', 'github'])` over `TestLive`. Its fixture includes accounts from multiple toolkits. The assertion checks that the resulting JSON contains only GitHub accounts.

For a change to toolkit filtering, the regression belongs in this test. A request-mapping change also needs an assertion on the request sent by the handler. An output change needs an assertion on the resulting JSON. The test should establish the changed behavior through the command's input and output.

The test helper calls the same [runInvocation](src/invocation/invocation.ts) function as the binary. Parsing, registration metadata, invocation hooks, error reporting, and lifecycle telemetry remain on the test path.

## Read a larger handler

The larger commands use the same declaration and handler layout. These source maps identify their main phases without requiring a contributor to read every helper first.

| Command                              | Main phases                                                                                                                                                                                 | Starting point                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `execute` / `dev playground-execute` | Selects single or parallel execution. The single-tool path handles schema-only requests, resolves execution context, checks connections, then validates or executes and reports the result. | [runToolsExecuteCommand and runToolsExecute](src/commands/tools/execute/tools.execute.handler.ts) |
| `listen`                             | Resolves the acting user and account, prepares event files, acquires a temporary trigger when needed, processes realtime events, then releases resources and reports write failures.        | [runListen](src/commands/listen/listen.handler.ts)                                                |
| `run`                                | Checks script input, resolves helper context and companion modules, prepares the child process, forwards signals, cleans up temporary files, then preserves the child's exit outcome.       | [runScript](src/commands/run/run.handler.ts)                                                      |
| `proxy`                              | Resolves the acting user, validates request input, selects the connected account and session, checks permissions, sends the proxy request, then formats the response.                       | [runProxy](src/commands/proxy/proxy.handler.ts)                                                   |

## Understand one invocation

[bin.ts](src/bin.ts) passes a normal invocation to [cli-main.ts](src/cli-main.ts), which supplies production dependencies and the process runner. The command assembly performs compatibility normalization for `run` script arguments and bare `listen --stream` before `effect/cli` parses argv.

For a selected command, registration begins its identity and runs its enabled invocation hooks. The invocation reports the invoked event, then checks unsupported shared flags and any login requirement before running the handler. The invocation reports success or failure and puts an unreported failure on screen once. The runner owns process signals and the final exit outcome.

Explicit help, version, and parse failures follow separate paths and skip selected-command hooks. [command-lifecycle-telemetry.ts](src/services/command-lifecycle-telemetry.ts) defines the lifecycle interface. A command declares shared policy through `withCommandMeta`, rather than adding another argv parser or lifecycle reporter.

Commands that report option properties attach `withCommandTelemetry` to their definition. Its callback receives the command's inferred, parsed input, including defaults from `Flag.withDefault`. [proxy.cmd.ts](src/commands/proxy/proxy.cmd.ts) shows a projection that reports the method, body presence, and header count while excluding the endpoint, body, header values, and account selector from events. [command-input.ts](src/analytics/command-input.ts) builds the safe properties and canonical enabled flag names from that explicit selection. A new flag needs no analytics entry unless it should be measured. Shared definitions carry the same projection into both command trees, and subcommands declare their own projections.

[events.ts](src/analytics/events.ts) constructs events from those safe properties and shared invocation metadata. It does not redeclare command input schemas or parser defaults. Help and parse failures have no parsed input, so their events omit command input properties. Parsed-input projections also summarize private inputs, such as search query length, before event construction.

## Verify a command change

Commands below run from the repository root after the pinned toolchain and dependencies are installed, as described in the [repository setup](../../../CONTRIBUTING.md#development-setup).

The focused test for the example is the first check.

```bash
pnpm --filter @composio/cli exec vitest run test/src/commands/connections/list/connections.list.cmd.test.ts
```

A new command needs a mirrored argv-level test and a registration in its group or the root tree. When a command path, registration, or help summary changes, the catalog is regenerated and committed with the change.

```bash
pnpm --filter @composio/cli run commands:map
```

Before pushing CLI source changes, the required checks include workspace typechecking and Effect diagnostics. The diagnostic check catches dropped Effects, including a client request that was created but never yielded.

```bash
pnpm typecheck
pnpm --filter @composio/cli run lint:effect
```

The package test command also validates bundled skills, registered lint exceptions, command-test paths, and the generated catalog.

```bash
pnpm --filter @composio/cli test
```

A compiled-binary or packaging change also needs the relevant [Docker CLI checks](../../e2e-tests/cli/README.md). Documentation-only changes do not need a Changeset.
