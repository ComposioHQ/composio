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

## References

- CLI architecture: `ts/packages/cli/AGENTS.md`.
- Effect and Clack sources are read-only under `ts/vendor/`.
