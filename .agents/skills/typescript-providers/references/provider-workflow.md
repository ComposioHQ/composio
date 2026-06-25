# TypeScript Provider Workflow

## Create Or Locate A Provider

```bash
pnpm create:provider <provider-name> [--agentic]
```

Providers live under `ts/packages/providers/`.

## Implementation Rules

- Preserve framework-native tool formats.
- Keep provider-specific code in the provider package.
- Avoid leaking provider-only dependencies into core.
- Update docs/examples when setup or public usage changes.
- Use `cross-sdk-parity` for providers with Python counterparts.

## Verification

```bash
pnpm --filter @composio/<provider> typecheck
pnpm --filter @composio/<provider> test
pnpm build:packages
```

Add tests for wrapping, tool-call handling, schema conversion, and framework version compatibility when relevant.
