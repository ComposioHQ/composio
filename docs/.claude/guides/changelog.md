# Changelog Guide

## File Naming

```
MM-DD-YY.mdx              # e.g., 12-29-25.mdx
MM-DD-YY-suffix.mdx       # Multiple same day: 12-10-25-masking.mdx
```

## Template

```mdx
---
title: "Your Title Here"
date: "YYYY-MM-DD"
---

Brief intro paragraph.

### SDK Versions (if applicable)

| SDK | Version |
|-----|---------|
| Python | v0.10.2 |
| TypeScript | v0.3.1 |

### Breaking Changes (if applicable)

<Callout type="warn">
**Breaking Change**

What breaks and why.
</Callout>

**Before:**
\`\`\`python
old_code()
\`\`\`

**After:**
\`\`\`python
new_code()
\`\`\`

### What's New / Improvements / Bug Fixes

- Change 1
- Change 2
```

## Rules

1. **Frontmatter required** — `title` and `date` (YYYY-MM-DD format)
2. **No `#` heading** — Title renders automatically from frontmatter
3. **Use `###` for sections** — Content headings start at h3
4. **No emojis** — No checkmarks, warning symbols, etc.

## Change Types

| Type | How to Format |
|------|---------------|
| Breaking Change | `<Callout type="warn">` + before/after code + migration guide |
| New Feature | `### What's New` |
| Improvement | `### Improvements` |
| Bug Fix | `### Bug Fixes` |
| Deprecation | `<Callout>` with timeline |

## Breaking Changes Checklist

For any breaking change, include:
- [ ] Before/after code examples
- [ ] Migration guide with step-by-step instructions
- [ ] Codemod (if applicable) — automated script to transform old code to new

**What's a codemod?** A script that automatically updates user code. Instead of "change X to Y manually", users run the codemod and it transforms their code. See [jscodeshift](https://github.com/facebook/jscodeshift) or [ts-morph](https://github.com/dsherret/ts-morph).
