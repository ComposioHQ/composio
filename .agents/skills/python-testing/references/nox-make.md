# Python Verification

## Setup

From `python/`:

```bash
make env
source .venv/bin/activate
```

## Make Targets

```bash
make fmt
make chk
make tst
make snt
make type_inference
make build
```

Friendly aliases exist for the short names: `make format` (fmt), `make check` (chk), `make test` (tst), `make sanity` (snt).

## Nox Sessions

Current sessions include:

- `fmt`: Ruff import fixes and formatting.
- `chk`: Ruff check and mypy.
- `fix`: Ruff automatic fixes.
- `type_inference`: provider return-type inference checks.
- `tst`: pytest test suite.
- `snt`: sanity tests.

When adding or renaming provider packages, inspect the `type_inference` session's explicit provider install list and checked test-file list.

## Test Placement

- Core tests live under `python/tests/`.
- Use existing fixtures from `python/tests/conftest.py`.
- Provider behavior should include provider-specific tests when applicable.
