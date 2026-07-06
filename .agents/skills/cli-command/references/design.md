# CLI Design

## Principles

- Keep stdout for data and stderr for human-readable decoration.
- Use `ui.output()` only for values scripts should capture.
- Keep quiet/piped mode clean.
- Prefer flags over ambiguous positional arguments.
- Use `--json`, `--dry-run`, `--force`, `--no-input`, and `--no-browser` consistently when the command shape needs them.
- Never accept secrets through flags.

## Help And Errors

- Help text is user experience. Lead with concise descriptions and common examples.
- Expected errors should tell the user what happened and the next command or fix.
- Unexpected errors should preserve debug detail through the existing effect-error machinery.

## Interactivity

- Use `@clack/prompts` through the existing CLI UI abstractions.
- Prompt only when stdin is a TTY.
- Non-interactive mode should fail with actionable messages instead of hanging.

## Configuration And Exit Codes

- Runtime config is read from environment variables via `effect/Config` (`src/services/config.ts`, `src/cli-config.ts`). Keys are upper snake case prefixed `COMPOSIO_` (the prefix is stripped on read); `DEBUG_OVERRIDE_*` and `FORCE_*` are read verbatim (`src/constants.ts`).
- Persistent user/auth state lives in `~/.composio/user-config.json`; `ComposioUserContext` merges environment variables over the stored file, so an env var overrides the stored value.
- Project-scoped data uses a project-local `.composio/` directory.
- Exit `0` on success and non-zero (`1`) on failure; interrupts are not treated as failures (`src/cli-main.ts` teardown via `BunRuntime.runMain`). There is no distinct "invalid usage" exit code — do not invent one.

## References

- CLI architecture: `ts/packages/cli/AGENTS.md`.
- Effect and Clack sources are read-only under `ts/vendor/`.
