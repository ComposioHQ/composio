# SDK Documentation Generator

Generates MDX reference docs from Python source using griffe.

## Usage

```bash
cd python
uv run --frozen --only-group docs-reference python scripts/generate-docs.py
```

## How it works

1. griffe extracts docstrings from `composio/**/*.py` → structured data
2. `generate-docs.py` transforms data → MDX files
3. Output written to `docs/content/reference/sdk-reference/python/`

## Configuration

- **Expected classes**: `EXPECTED_CLASSES` dict maps class name → Composio property
- **Modules to search**: `CLASS_MODULES` list
- **Decorators**: `DECORATORS_TO_DOCUMENT` list

## CI

`.github/workflows/docs-sdk-reference-drift.yml` regenerates the reference on PRs to `next` that change `python/composio/**` or this generator, and fails if the committed output differs. `griffe` is pinned in the `docs-reference` dependency group in `python/pyproject.toml`.
