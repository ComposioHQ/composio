# TypeScript Core SDK

## Key Files

- `ts/packages/core/src/index.ts`: package entrypoint.
- `ts/packages/core/src/composio.ts`: main `Composio` class.
- `ts/packages/core/src/models/`: model abstractions.
- `ts/packages/core/src/provider/`: base provider integration.
- `ts/packages/core/src/services/`: internal services.
- `ts/packages/core/src/types/`: public and internal types.
- `ts/packages/core/src/utils/`: utilities.

## Patterns

- Follow existing package exports and named export conventions.
- Keep public API changes typed and documented.
- Use local error classes/result shapes instead of introducing new error conventions.
- Check Python parity for shared concepts.
- Keep generated API surfaces under generator ownership.

## Verification

Common focused checks:

```bash
pnpm --filter @composio/core typecheck
pnpm --filter @composio/core test
pnpm typecheck
pnpm test
```

Add or update tests for behavior changes.
