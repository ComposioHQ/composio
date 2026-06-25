# AGENTS.md

Python provider guidance.

## Scope

Each child directory is a Python provider package that adapts Composio to a framework or agent runtime.

## Skill Routing

Use `python-providers` for provider implementation and `python-testing` for nox/pytest verification. Use `cross-sdk-parity` when the provider mirrors a TypeScript package.

## Commands

Run from `python/`:

```bash
make create-provider name=<provider-name>
make create-provider name=<provider-name> agentic=true
make chk
make tst
make type_inference
```

## Rules

- Keep provider dependencies in the provider package metadata unless shared tooling needs them.
- Preserve Python naming conventions and public import paths.
- Add provider tests and type-inference coverage when public return types change.
- New providers or renamed provider packages usually need explicit entries in `python/noxfile.py`'s `type_inference` install list and checked-file list.
- Verify package metadata before release-facing changes.
