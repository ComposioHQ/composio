# Python Provider Workflow

## Create Or Locate A Provider

Run from `python/`:

```bash
make create-provider name=<provider-name>
make create-provider name=<provider-name> agentic=true
```

Provider packages live under `python/providers/`.

## Implementation Rules

- Keep provider dependencies in provider package metadata unless shared tooling needs them.
- Preserve public import paths.
- Match framework-native conventions.
- Update docs/examples when public usage changes.
- Use `cross-sdk-parity` for providers with TypeScript counterparts.
- New providers or renamed provider packages usually need explicit entries in `python/noxfile.py`'s `type_inference` provider install list and checked-file list.

## Verification

Run from `python/`:

```bash
make chk
make tst
make type_inference
```

For narrow iteration, use pytest markers or direct test paths that match the provider.

For release-facing package metadata, build first and then use `twine check dist/*` when distribution files are present.
