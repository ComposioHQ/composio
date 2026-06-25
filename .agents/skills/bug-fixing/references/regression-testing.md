# Regression Testing

## Workflow

1. Reproduce the bug or identify the failing assertion/CI job.
2. Trace the root cause in the smallest affected module.
3. Patch the cause, not only the symptom.
4. Add or update a regression test in the existing test area for that feature.
5. Run the focused test first, then the smallest broader check that covers the touched surface.

## TypeScript Tests

- Tests usually live under `ts/packages/<package>/test/`.
- Use Vitest patterns already present in the package.
- Prefer adding to an existing feature test file over creating one-off regression files.
- Useful commands:

```bash
pnpm --filter @composio/<package> test
pnpm --filter @composio/<package> typecheck
pnpm test
```

## Python Tests

- Tests live under `python/tests/`.
- Shared fixtures live in `python/tests/conftest.py`.
- Use pytest markers that match the affected package or provider.
- Useful commands from `python/`:

```bash
make chk
make tst
make snt
pytest tests/test_<feature>.py
```

## PR Notes

In the PR body, name the bug, the regression test, and the verification command output. If a test is intentionally skipped, say why.
