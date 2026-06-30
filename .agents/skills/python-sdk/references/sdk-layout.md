# Python SDK Layout

## Key Areas

- `python/composio/`: core Python SDK.
- `python/tests/`: pytest coverage.
- `python/providers/`: provider packages.
- `python/scripts/`: release and maintenance scripts.
- `python/config/`: Ruff, pytest, and mypy config.

## Patterns

- Preserve Python naming conventions.
- Keep provider-specific behavior out of core unless it is part of the shared abstraction.
- Add local types rather than importing churn-prone generated-client internals when a small typed shape is enough.
- Check TypeScript parity for shared SDK concepts.

## Setup And Checks

Run from `python/`:

```bash
make env
source .venv/bin/activate
make chk
make tst
```
