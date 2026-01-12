# SDK Documentation Generator

Generates MDX reference docs from Python source using griffe.

## Usage

```bash
cd python
uv run --with griffe python scripts/generate-docs.py
```

## How it works

1. griffe extracts docstrings from `composio/**/*.py` → structured data
2. `generate-docs.py` transforms data → MDX files
3. Output written to `fumadocs/content/reference/sdk-reference/python/`

## Configuration

- **Expected classes**: `EXPECTED_CLASSES` dict maps class name → Composio property
- **Modules to search**: `CLASS_MODULES` list
- **Decorators**: `DECORATORS_TO_DOCUMENT` list

## CI

`.github/workflows/generate-sdk-docs.yml` triggers on changes to `python/composio/**` and opens a PR with updated docs.
