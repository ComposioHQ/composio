Check the changes between the current branch and next branch, and create a changelog file inside `/fern/pages/src/changelog` in the file format of `MM-DD-YY-<title>.md`.

## Changelog File Structure

### Required Sections

1. **Title** (H1): A clear, descriptive title of the change
2. **Version Information**: Include SDK versions for both TypeScript and Python
3. **Description**: Brief explanation of what changed and why

### Version Information Format

```markdown
## Version Information

### TypeScript/JavaScript
- Package: `@composio/core` (and provider packages if applicable)
- Version: `X.Y.Z`+

### Python
- Package: `composio` (and provider packages if applicable)
- Version: `X.Y.Z`+
```

Use `+` suffix to indicate "this version and later".

### Optional Sections (include as needed)

- **What Changed**: Before/after comparison with code examples
- **Why This Change?**: Explanation of the motivation
- **New Features/Capabilities**: For feature additions
- **Migration Guide**: For breaking changes
- **Backward Compatibility**: Compatibility notes
- **Impact Summary**: Table showing breaking changes and migration requirements
- **How to Update**: Package manager commands for updating

### Alerts

Use these MDX components for important notices:
- `<Warning>` for breaking changes
- `<Note>` for important information

### Code Examples

Use `<CodeBlocks>` for side-by-side Python/TypeScript examples:

```markdown
<CodeBlocks>
```python title="Python SDK"
# Python code
```

```typescript title="TypeScript SDK"
// TypeScript code
```
</CodeBlocks>
```

## Examples

- Bug fix: `01-21-26-initiate-active-status-filter.md`
- Breaking change: `01-14-26-auth-config-patch-semantics.md`
- New feature: `01-12-26-tool-router-improvements.md`
- Simple change: `01-09-26.md`

## Instructions
- Avoid using emojies in top level, it's okay within code samples only when necessary

