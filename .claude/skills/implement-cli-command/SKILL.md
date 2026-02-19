---
description: Implement new CLI commands in ts/packages/cli/ using Effect.ts patterns, service wiring, and @effect/cli declarations.
---

# Implement CLI Command

Implement new commands and subcommands in `ts/packages/cli/`. Covers file creation, Effect patterns, service wiring, option declaration, output conventions, and registration.

## When to Use

- Implementing a new CLI command from a spec or design
- Adding a subcommand to an existing command group
- Wiring a new command into the command tree
- Understanding how existing commands work to extend them

For CLI **design** (arguments, flags, help text, UX), see the `create-cli` skill instead.
For CLI **e2e tests**, see the `create-cli-e2e` skill instead.

## Architecture

The CLI uses `@effect/cli` for command declaration, `effect` for the runtime, and a service-oriented architecture with dependency injection via Effect layers.

See `ts/packages/cli/AGENTS.md` for the full architecture reference (services, effects, models, dependencies, vendor submodule locations).

```
src/
├── bin.ts                    # Entry point — layer composition, error handling, runtime
├── commands/
│   ├── index.ts              # Command tree — registers all commands
│   ├── $default.cmd.ts       # Root command with global options (--log-level)
│   ├── version.cmd.ts        # Simple data command
│   ├── whoami.cmd.ts         # Data command with service dependency
│   ├── login.cmd.ts          # Complex command (options, spinner, polling)
│   ├── logout.cmd.ts         # Action command (no stdout data)
│   ├── upgrade.cmd.ts        # Action command (delegates to service)
│   ├── generate.cmd.ts       # Command that auto-delegates to subcommands
│   ├── ts/
│   │   ├── ts.cmd.ts         # Parent command group
│   │   └── commands/
│   │       └── ts.generate.cmd.ts  # Subcommand with complex logic
│   └── py/
│       ├── py.cmd.ts
│       └── commands/
│           └── py.generate.cmd.ts
├── services/                 # Effect services (dependency injection)
├── effects/                  # Reusable Effect computations
├── models/                   # Effect Schema definitions
├── generation/               # Code generation pipeline
├── effect-errors/            # Error capture and formatting
└── ui/                       # Terminal output helpers
```

### File Naming Convention

- Command files: `<name>.cmd.ts` (e.g., `version.cmd.ts`, `login.cmd.ts`)
- Subcommand files: `<parent>.<name>.cmd.ts` inside `commands/` (e.g., `ts.generate.cmd.ts`)
- Parent command groups: `<name>.cmd.ts` at the group level (e.g., `ts/ts.cmd.ts`)

## Creating a New Command

### Step 1: Create the Command File

Create `src/commands/<name>.cmd.ts`.

**Minimal template** (data command, no options):

```typescript
import { Command } from '@effect/cli';
import { Effect } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';

export const myCmd = Command.make('my-command', {}).pipe(
  Command.withDescription('Brief description of what the command does.'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;

      // Compute result...
      const result = 'some-value';

      yield* ui.log.info(result);   // Decoration → stderr
      yield* ui.output(result);     // Data → stdout (for scripts)
    })
  )
);
```

**Template with options:**

```typescript
import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';

// Define options at module level
const toolkitSlug = Options.text('toolkit').pipe(
  Options.withDescription('Toolkit slug to look up.')
);

const searchOpt = Options.optional(
  Options.text('search')
).pipe(
  Options.withDescription('Search query to filter results.')
);

export const myCmd = Command.make('my-command', { toolkitSlug, searchOpt }).pipe(
  Command.withDescription('Brief description.'),
  Command.withHandler(({ toolkitSlug, searchOpt }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const client = yield* ComposioToolkitsRepository;

      yield* ui.intro('composio my-command');

      // Use options — searchOpt is Option<string>
      const search = Option.getOrUndefined(searchOpt);

      // Fetch data with spinner
      const result = yield* ui.withSpinner(
        'Fetching data...',
        client.getToolkits(),
        { successMessage: 'Done', errorMessage: 'Failed to fetch' }
      );

      // Output
      yield* ui.note(formatResult(result), 'Result');
      yield* ui.output(formatResult(result));
      yield* ui.outro('Done');
    })
  )
);
```

### Step 2: Register the Command

Add the command to `src/commands/index.ts`:

```typescript
import { myCmd } from './my-command.cmd';

const $cmd = $defaultCmd.pipe(
  Command.withSubcommands([
    versionCmd,
    upgradeCmd,
    whoamiCmd,
    loginCmd,
    logoutCmd,
    generateCmd,
    pyCmd,
    tsCmd,
    myCmd,  // Add here
  ])
);
```

### Step 3: Add Required Service Layers (if any)

If your command uses a new service not already in `bin.ts`, add its layer:

```typescript
// In src/bin.ts
const layers = Layer.mergeAll(
  // ... existing layers
  MyNewServiceLive,  // Add if needed
);
```

Most commands only use services already provided. The `ComposioToolkitsRepository` service is provided by `ComposioToolkitsRepositoryCachedLive` in `bin.ts` — you do not need to add a separate layer for the base repository.

## Creating a Subcommand Group

For commands like `composio toolkits list`, `composio toolkits info`:

### Step 1: Create the Directory Structure

```
src/commands/toolkits/
├── toolkits.cmd.ts              # Parent command group
└── commands/
    ├── toolkits.list.cmd.ts     # composio toolkits list
    └── toolkits.info.cmd.ts     # composio toolkits info
```

### Step 2: Create the Parent Command

`src/commands/toolkits/toolkits.cmd.ts`:

```typescript
import { Command } from '@effect/cli';
import { toolkitsCmd$List } from './commands/toolkits.list.cmd';
import { toolkitsCmd$Info } from './commands/toolkits.info.cmd';

export const toolkitsCmd = Command.make('toolkits').pipe(
  Command.withDescription('Discover and inspect available toolkits.'),
  Command.withSubcommands([toolkitsCmd$List, toolkitsCmd$Info])
);
```

### Step 3: Create Each Subcommand

`src/commands/toolkits/commands/toolkits.list.cmd.ts`:

```typescript
import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';

const searchOpt = Options.optional(
  Options.text('search')
).pipe(
  Options.withDescription('Search toolkits by name or description.')
);

export const toolkitsCmd$List = Command.make('list', { searchOpt }).pipe(
  Command.withDescription('List available toolkits.'),
  Command.withHandler(({ searchOpt }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const client = yield* ComposioToolkitsRepository;

      const toolkits = yield* ui.withSpinner(
        'Fetching toolkits...',
        client.getToolkits(),
        { successMessage: 'Toolkits loaded' }
      );

      // Format and output
      const output = toolkits
        .map(t => `${t.slug} - ${t.meta.description}`)
        .join('\n');

      yield* ui.log.info(output);
      yield* ui.output(output);
    })
  )
);
```

### Step 4: Register the Parent in index.ts

```typescript
import { toolkitsCmd } from './toolkits/toolkits.cmd';

const $cmd = $defaultCmd.pipe(
  Command.withSubcommands([
    // ... existing commands
    toolkitsCmd,
  ])
);
```

## Option Declaration Patterns

Options are declared at module level using `@effect/cli`'s `Options` API. The template above demonstrates the most common types (required text, optional text). For other option types, see `ts/vendor/effect/packages/cli/src/Options.ts`.

Both `Options.optional(Options.text(...))` (wrapping) and `Options.text(...).pipe(Options.optional)` (piped) are valid. Use whichever reads better.

### Common patterns:

```typescript
import { Options } from '@effect/cli';

// Boolean flag (with default)
const verbose = Options.boolean('verbose').pipe(
  Options.withDefault(false),
  Options.withDescription('Enable verbose output.')
);

// Text with alias
const output = Options.optional(
  Options.text('output')
).pipe(
  Options.withAlias('o'),
  Options.withDescription('Output path.')
);

// Choice from fixed set
const format = Options.choice('format', ['json', 'table', 'plain']).pipe(
  Options.withDefault('table'),
  Options.withDescription('Output format.')
);
```

### Using Options in Handler

```typescript
Command.make('my-cmd', { search, verbose }).pipe(
  Command.withHandler(({ search, verbose }) =>
    Effect.gen(function* () {
      // search: Option<string> — use Option.getOrUndefined, Option.match, Option.isSome
      const searchValue = Option.getOrUndefined(search);

      // verbose: boolean — direct use
      if (verbose) { yield* Effect.logDebug('Verbose mode'); }
    })
  )
);
```

## Output Conventions

Follow the output conventions in `ts/packages/cli/AGENTS.md` § "Output Conventions" (stdout for data via `ui.output()`, stderr for decoration).

**Data commands** — produce a value scripts should capture:

```typescript
yield* ui.note(apiKey, 'API Key');   // Decoration → stderr (pretty box)
yield* ui.output(apiKey);            // Data → stdout (scripts capture)
```

**Action commands** — perform a side effect, no data:

```typescript
yield* ui.log.success('Logged out successfully.');
// NO ui.output() call — nothing for scripts to capture
```

## TerminalUI Spinners

The `TerminalUI` service provides two spinner APIs. For output/decoration methods (`output`, `log.*`, `note`, `intro`, `outro`), see `ts/packages/cli/src/services/terminal-ui.ts`.

```typescript
// Automatic: wraps an Effect, auto-stops on success/error
const result = yield* ui.withSpinner(
  'Loading...',
  someEffect,
  { successMessage: 'Done!', errorMessage: 'Failed!' }
);

// Manual: full control over message updates
const result = yield* ui.useMakeSpinner('Loading...', spinner =>
  Effect.gen(function* () {
    yield* spinner.message('Step 1...');
    const data = yield* fetchStep1;
    yield* spinner.message('Step 2...');
    const result = yield* fetchStep2(data);
    yield* spinner.stop('All done!');
    return result;
  })
);
```

## Creating a New Service

If your command requires functionality not covered by existing services (see `ts/packages/cli/AGENTS.md` for the full list):

1. Define the service interface and tag in `src/services/<name>.ts`
2. Create a `Live` layer implementation
3. Register the layer in `src/bin.ts`

Reference `src/services/upgrade-binary.ts` for a simple service pattern, or `src/services/composio-clients.ts` for a complex one with caching.

## Error Handling Patterns

### Optional Values

```typescript
yield* ctx.data.apiKey.pipe(
  Option.match({
    onNone: () => ui.log.warn('Not logged in. Run `composio login`.'),
    onSome: apiKey =>
      Effect.gen(function* () {
        yield* ui.output(apiKey);
      }),
  })
);
```

### Typed Errors with catchTag

```typescript
yield* client.getToolkitsBySlugs(slugs).pipe(
  Effect.catchTag('services/InvalidToolkitsError', error =>
    Effect.gen(function* () {
      yield* ui.log.error(`Invalid toolkits: ${error.invalidToolkits.join(', ')}`);
      return yield* Effect.fail(error);
    })
  )
);
```

### Logging Non-Fatal Errors

```typescript
yield* riskyOperation.pipe(
  Effect.catchAll(error =>
    Effect.logWarning(`Non-critical failure: ${error.message}`)
  )
);
```

## Parallel Data Fetching

Use `Effect.all` with `concurrency` for parallel API calls:

```typescript
const [toolkits, tools, triggerTypes] = yield* Effect.all(
  [
    client.getToolkits(),
    client.getTools(slugs),
    client.getTriggerTypes(slugs),
  ],
  { concurrency: 'unbounded' }
);
```

## Extracting Reusable Logic

For commands that share logic (e.g., `composio generate` delegates to `composio ts generate`):

```typescript
// In ts.generate.cmd.ts — export the logic separately
export function generateTypescriptTypeStubs(params: { ... }) {
  return Effect.gen(function* () {
    const ui = yield* TerminalUI;
    // ... implementation
  });
}

// The command uses it
export const tsCmd$Generate = Command.make('generate', { ... }).pipe(
  Command.withHandler(params => generateTypescriptTypeStubs(params))
);

// Other commands can reuse it
// In generate.cmd.ts
import { generateTypescriptTypeStubs } from './ts/commands/ts.generate.cmd';

yield* Match.value(envLang).pipe(
  Match.when('TypeScript', () => generateTypescriptTypeStubs({ ... })),
  Match.when('Python', () => generatePythonTypeStubs({ ... })),
  Match.exhaustive
);
```

## Retry with Exponential Backoff

For polling operations (e.g., waiting for OAuth):

```typescript
import { Schedule } from 'effect';

const result = yield* ui.useMakeSpinner('Waiting...', spinner =>
  Effect.retry(
    Effect.gen(function* () {
      const status = yield* client.getSession(session);
      if (status.status === 'linked') return status;
      return yield* Effect.fail(new Error('Still pending'));
    }),
    Schedule.exponential('0.3 seconds').pipe(
      Schedule.intersect(Schedule.recurs(15)),
      Schedule.intersect(Schedule.spaced('5 seconds'))
    )
  ).pipe(
    Effect.tap(() => spinner.stop('Success!')),
    Effect.tapError(() => spinner.error('Timed out'))
  )
);
```

## Checklist

When implementing a new command:

1. Create `src/commands/<name>.cmd.ts` (or `src/commands/<group>/commands/<group>.<name>.cmd.ts` for subcommands)
2. Define options at module level using `Options.*`
3. Create the command with `Command.make(name, options).pipe(Command.withDescription(...), Command.withHandler(...))`
4. In the handler, resolve services with `yield* ServiceName`
5. Follow the output convention: `ui.output()` for data, `ui.log.*` for decoration
6. Register in `src/commands/index.ts` (or in the parent group's command file)
7. If using a new service, add its layer to `src/bin.ts`
8. Build to verify: `cd ts/packages/cli && pnpm build`
9. Add recordings for the new command (see **Recording** below)

If the build fails, check for: (1) missing service imports, (2) `Option<string>` being used where `string` is expected (use `Option.getOrUndefined` or `Option.match`), (3) the command not being exported from its file.

## Recording

New commands should have VHS recordings for documentation. Recordings produce SVGs and asciicasts that demonstrate the command in action.

### Step 1: Add Entries to recordings.yaml

Add recording entries to `ts/packages/cli/recordings/recordings.yaml` under the appropriate group:

```yaml
recordings:
  my-command:
    - name: help
      description: Show my-command help
      command: "composio my-command --help"
      height: dynamic  # Use for commands whose output exceeds 750px

    - name: basic
      description: Run my-command with default options
      command: "composio my-command"
```

Each entry has:
- `name` — filename for the recording (produces `<name>.svg`, `<name>.ascii`, `<name>.tape`)
- `command` — the exact shell command to record
- `description` — (optional) comment shown instantly above the command
- `sleepAfterEnter` — (optional) override the default wait time after Enter (default: `6s`)
- `height` — (optional) `'dynamic'` for auto-sizing via two-pass recording, or a fixed pixel number. Omit to use the default height (750px)

Use `height: dynamic` for commands that produce long output (help text, full listings). Fixed height is fine for short-output commands (version, no-results, limited queries).

### Step 2: Run the Recorder

```bash
cd ts/packages/cli
bun scripts/record.ts
```

Requires `COMPOSIO_API_KEY` in the environment and `vhs` + `composio` on `PATH`.

### Output Structure

```
recordings/
├── recordings.yaml                    # Config
├── tapes/<group>/<name>.tape          # Generated VHS tape files (committed)
├── svgs/<group>/<name>.svg            # SVG recordings
└── ascii/<group>/<name>.ascii         # Asciicast recordings
```

## Reference Files

| File | Purpose |
|---|---|
| `src/commands/version.cmd.ts` | Simplest command (no options, no services beyond TerminalUI) |
| `src/commands/whoami.cmd.ts` | Data command with service dependency |
| `src/commands/login.cmd.ts` | Complex command (options, spinner, polling, retry) |
| `src/commands/logout.cmd.ts` | Action command (no stdout data) |
| `src/commands/upgrade.cmd.ts` | Action command delegating to service |
| `src/commands/generate.cmd.ts` | Auto-detection and delegation to subcommands |
| `src/commands/ts/commands/ts.generate.cmd.ts` | Full subcommand with parallel fetching, spinner, file I/O |
| `src/commands/index.ts` | Command tree registration |
| `src/bin.ts` | Entry point, layer composition, error handling |
| `src/services/terminal-ui.ts` | TerminalUI service interface |
| `src/services/composio-clients.ts` | API client service (HTTP, pagination, metrics) |
| `ts/packages/cli/AGENTS.md` | CLI architecture, services, effects, output conventions |
