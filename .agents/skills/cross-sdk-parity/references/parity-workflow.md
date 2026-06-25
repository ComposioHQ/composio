# Cross-SDK Parity Workflow

## Compare The Public Contract

Check both SDKs for concepts that users experience as equivalent:

- tools and toolkits
- sessions and Tool Router behavior
- connected accounts
- auth configs
- provider wrappers
- error shapes and status handling
- docs examples and changelog text

## Generated Client Bumps

TypeScript:

- Verify `npm view @composio/client version`.
- Update the catalog pin in `pnpm-workspace.yaml`.
- Refresh `pnpm-lock.yaml` with `pnpm install --lockfile-only`.
- Add changesets for affected published packages.

Python:

- Verify `pip index versions composio-client`.
- Update `python/pyproject.toml`.
- Update `python/setup.py`.
- Refresh root `uv.lock` with `uv lock --upgrade-package composio-client`.
- Run an import check such as `uv run --package composio python -c "import composio"` when dependencies are synced.

## Naming

- TypeScript public APIs use camelCase.
- Python public APIs use snake_case.
- Preserve backend wire names only where generated clients require them.

## Verification

Run the smallest checks that prove both SDKs still expose the intended behavior. Prefer an import/typecheck/test pair over relying on version bumps alone.
