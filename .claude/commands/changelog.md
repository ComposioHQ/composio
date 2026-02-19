Check the changes between the current branch and next branch, and create a changelog file inside `/docs/content/changelog` in the file format of `MM-DD-YY-<title>.mdx`.

## File Naming

```
MM-DD-YY.mdx              # e.g., 12-29-25.mdx
MM-DD-YY-suffix.mdx       # Multiple same day: 12-10-25-masking.mdx
```

## Template

```mdx
---
title: "Your Title Here"
description: "Brief description of the change"
date: "YYYY-MM-DD"
---

Brief intro paragraph explaining what changed.

### SDK Versions

| SDK | Version |
|-----|---------|
| Python | vX.Y.Z+ |
| TypeScript | vX.Y.Z+ |

### What Changed (if applicable)

**Before:**
```python
old_code()
```

**After:**
```python
new_code()
```

### Breaking Changes (if applicable)

<Callout type="warn">
**Breaking Change**

What breaks and why.
</Callout>

### What's New / Improvements / Bug Fixes

- Change 1
- Change 2

### Backward Compatibility

Notes about backward compatibility.
```

## Rules

1. **Frontmatter required** - `title`, `description`, and `date` (YYYY-MM-DD format)
2. **No `#` heading** - Title renders automatically from frontmatter
3. **Use `###` for sections** - Content headings start at h3
4. **No emojis** - No checkmarks, warning symbols, etc. in prose (okay in code comments)
5. **TypeScript code blocks** - Add `// @noErrors` on first line to skip type checking

## Change Types

| Type | How to Format |
|------|---------------|
| Breaking Change | `<Callout type="warn">` + before/after code + migration guide |
| New Feature | `### What's New` |
| Improvement | `### Improvements` |
| Bug Fix | `### Bug Fixes` or inline description |
| Deprecation | `<Callout>` with timeline |

## Code Examples

For TypeScript code that shouldn't be type-checked:

```typescript
// @noErrors
const result = await composio.tools.get(userId);
```

For before/after comparisons, use labeled sections:

**Before:**
```python
old_code()
```

**After:**
```python
new_code()
```

## Examples

Reference these existing changelogs for style:
- Bug fix: `01-21-26-initiate-active-status-filter.mdx`
- Breaking change: `01-14-26-auth-config-patch-semantics.mdx`
- New feature: `01-12-26-tool-router-improvements.mdx`
- Simple change: `01-30-26-simplified-optional-schemas.mdx`
