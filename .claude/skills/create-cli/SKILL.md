---
description: CLI design guidelines — arguments, flags, subcommands, help, output, errors, interactivity, config precedence. Apply when designing new commands or reviewing CLI UX.
globs:
  - "ts/packages/cli/src/**/*.ts"
alwaysApply: false
---

# CLI Design Guidelines

Design CLI surface area (syntax + behavior), human-first, script-friendly.
Adapted from [clig.dev](https://clig.dev/) for our TypeScript + Effect.ts + Clack stack.

## When to Use

- Designing a CLI spec (before implementation) or refactoring CLI surface area.
- Adding new commands, flags, or interactive prompts.
- Reviewing CLI UX decisions.

After designing a command, use the `implement-cli-command` skill to build it.
After implementation, use the `create-cli-e2e` skill to write end-to-end tests.

## Stack & Architecture

See `ts/packages/cli/AGENTS.md` for the full architecture reference, including dependencies, services, effects, and vendor submodule locations.

## Output Conventions

The CLI separates human-readable decoration from machine-readable data. See `ts/packages/cli/AGENTS.md` § "Output Conventions" for the full specification.

Key rule: when adding a command, ask "Does this produce a value scripts should capture?"
- **Yes** → `ui.output(value)` for data, `ui.log.*` / `ui.note()` for context.
- **No** → Only `ui.log.*` / `ui.note()` / `ui.intro()` / `ui.outro()`.

**Show state changes.** When a command modifies state, say what changed and the new state:

```typescript
// After logout:
yield* ui.log.info('Removed API key from ~/.composio/user-config.json');

// After generate:
yield* ui.log.success('Generated 42 tools across 5 toolkits → src/generated/');
```

## Arguments & Flags

Define options via `@effect/cli`:

```typescript
const toolkits = Options.text('toolkits').pipe(
  Options.optional,
  Options.withDescription('Comma-separated toolkit slugs'),
);
const force = Options.boolean('force').pipe(
  Options.withAlias('f'),
  Options.withDefault(false),
);
```

Principles:
- Prefer flags over positional args for clarity and extensibility.
- Provide long versions of all flags; one-letter aliases only for the most common.
- Default values should be right for most users.
- Never accept secrets via flags — they leak to `ps` output and shell history. Use `--password-file`, stdin, or a secret manager instead.
- Support `-` for stdin/stdout when input/output is a file path.

Standard flag names:

| Flag | Short | Purpose |
| ---- | ----- | ------- |
| `--help` | `-h` | Show help (built-in via @effect/cli) |
| `--version` | | Print version to stdout |
| `--quiet` | `-q` | Less output |
| `--verbose` | `-v` | More output (never use `-v` for version) |
| `--debug` | `-d` | Debug output |
| `--force` | `-f` | Skip confirmations |
| `--dry-run` | `-n` | Preview only |
| `--json` | | Structured output |
| `--output` | `-o` | Output file path |
| `--no-input` | | Disable prompts; fail if required input missing |
| `--no-browser` | | Skip browser-open steps |
| `--no-color` | | Disable color output |

## Subcommands

```typescript
const login = Command.make('login', { noBrowser }, handler);
const generate = Command.make('generate', { toolkits, typeTools }, handler);
const root = Command.make('composio').pipe(
  Command.withSubcommands([login, generate, /* ... */]),
);
```

- Follow verb-noun pattern consistently: `composio login`, `composio generate`.
- Share global flags via parent command composition.
- Support `composio help <subcmd>` and `composio <subcmd> --help`.
- Avoid ambiguous pairs (`update` vs `upgrade`) unless sharply differentiated.

## Interactivity

Use `@clack/prompts` for all interactive UI. All Clack output goes to stderr via `{ output: process.stderr }`.

| Prompt | When to use |
| ------ | ----------- |
| `text()` | Free-form text input |
| `password()` | Secret input (echo disabled) |
| `confirm()` | Yes/no decisions |
| `select()` | Choose one from a list |
| `multiselect()` | Choose multiple from a list |
| `spinner()` | Long-running operations |
| `log.info/warn/error/step()` | Styled status messages |
| `note()` | Boxed contextual info |
| `intro()` / `outro()` | Session start/end markers |

Rules:
- Prompt only if stdin is a TTY.
- `--no-input`: never prompt; fail with actionable message if required input missing.
- Make escape hatches obvious (Ctrl-C).
- Destructive operations: interactive confirmation + non-interactive requires `--force`.

## Error Handling

- Use the `effect-errors/` module for capture and formatting.
- Catch and rewrite expected errors for humans; no stack traces by default.
- Put the most important info last; use red intentionally.
- For unexpected crashes: provide debug info path + bug report instructions.

**Write actionable error messages.** Tell the user *what went wrong* and *how to fix it*:

```
// Bad:
Error: EACCES

// Good:
Can't write to ~/.composio/user-config.json.
You might need to fix permissions: chmod +w ~/.composio/user-config.json

// Bad:
Error: 401

// Good:
API key is invalid or expired.
Run `composio login` to authenticate again.
```

**Suggest corrections** when the user mistypes a subcommand or flag. If they ran `composio genrate`, suggest `composio generate`.

Exit codes:

| Code | Meaning |
| ---- | ------- |
| `0` | Success |
| `1` | Generic failure |
| `2` | Invalid usage (parse/validation error) |

## Help & Documentation

- `@effect/cli` generates help text from Command/Options declarations.
- If run with missing required args, show concise help + 1–2 examples + "use --help for more".
- Lead with examples; show common flags first.
- Link to docs URL per subcommand when applicable.
- Provide both terminal help (offline, version-synced) and web docs (searchable, linkable).

Good help text structure:

```
USAGE
  $ composio generate [--toolkits <slugs>] [--type-tools]

OPTIONS
  --toolkits <slugs>   Comma-separated toolkit slugs (default: all)
  --type-tools         Generate full type definitions
  -o, --output <dir>   Output directory (default: @composio/core/generated)

EXAMPLES
  $ composio generate
  $ composio generate --toolkits github,slack --type-tools

COMMANDS
  composio ts generate   Generate TypeScript stubs
  composio py generate   Generate Python stubs
```

**Suggest next commands** when it helps the user's flow:

```
✔ Logged in as user@example.com
  Next: run `composio generate` to generate type stubs for your toolkits.
```

## Configuration Precedence

High to low: **flags > process env > project config > user config > system config**.

- Composio prefixes: `COMPOSIO_*` for app config, `DEBUG_OVERRIDE_*` for debug.
- User config stored in `~/.composio/`.
- Respect common env vars: `NO_COLOR`, `DEBUG`, `EDITOR`, `PAGER`, `TERM`, `TMPDIR`, `HOME`.

## Naming

- Subcommand names: simple, lowercase, single word when possible.
- Avoid too-generic names that collide with system tools.
- Keep names short but not cryptic — easy to type matters.
- Never create implicit catch-all subcommands that prevent future expansion.
- Don't allow arbitrary abbreviations (reserving `g` for `generate` blocks future `g`-commands).
- Use explicit aliases only when there's a clear, stable mapping.

## Robustness & Performance

- Validate early; fail fast with good error messages.
- Print something within ~100ms (especially before network I/O). Start a Clack spinner immediately before any network call.
- Show progress for long tasks (interactive only) via Clack spinners.
- Use timeouts for network calls; allow configuration.
- Make reruns safe: idempotent where possible; recoverable on failure.
- **Crash-only design**: assume cleanup might not run. Defer cleanup to the next invocation rather than relying on shutdown hooks. If a cache file is half-written, the next run should detect and rebuild it.

## Example Invocations

```bash
# Interactive — user sees Clack decoration on stderr
composio login
composio generate --toolkits github,slack

# Piped — only data on stdout, no decoration
composio whoami | pbcopy
API_KEY=$(composio whoami)
composio version | cat

# Non-interactive with force
composio logout --force --no-input

# Debug mode
composio generate --debug --verbose
```

## References

- Community CLI Guidelines: https://clig.dev/
- CLI architecture: `ts/packages/cli/AGENTS.md`
- @effect/cli source: `ts/vendor/effect/packages/cli/src/`
- @clack/prompts source: `ts/vendor/clack/packages/prompts/src/`
