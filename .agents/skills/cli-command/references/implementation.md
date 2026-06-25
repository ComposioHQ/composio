# CLI Implementation

## Command Files

- Top-level command files use `<name>.cmd.ts`.
- Nested command groups live in a directory with a group entrypoint.
- Register new commands through `src/commands/index.ts` or the nearest group entry.

## Effect Patterns

The CLI uses `@effect/cli`, `effect`, and Bun runtime layers.

Common shape:

```typescript
import { Command } from '@effect/cli';
import { Effect } from 'effect';

export const myCmd = Command.make('my-command', {}, () =>
  Effect.gen(function* () {
    // resolve services with yield*
  })
);
```

Follow existing local patterns before introducing new service abstractions.

## Required Checks

For CLI source changes, run from the repo root:

```bash
pnpm typecheck
pnpm --filter @composio/cli test
```

For binary behavior, pair with the `cli-e2e` skill.

## Recordings

Add VHS recordings when a user-facing command changes documented workflow, introduces a new visible command surface, or needs release-note demo coverage. Skip them for internal wiring changes or hidden developer helpers, and say why in the PR.
