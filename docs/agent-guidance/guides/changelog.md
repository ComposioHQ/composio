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
| Python `composio` | `0.10.2` |
| TypeScript `@composio/core` | `0.3.1` |

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

Use the released version in the final table column. The Python release guard reads that column from rows labelled `Python \`composio\``.

## SDK release entries

The SDK release workflow writes one entry per release to `docs/content/changelog/`, with `sdkRelease` and `sdkReleaseTargets` frontmatter, the version table, the changeset summaries, and a link to the request issue. Its prose comes from the changesets: to change it, fix the changesets on `next` and request a new release. Do not hand-edit generated entries in the release PR.

The release PR also regenerates `docs/content/reference/sdk-reference/` from the released source. Changelog code fences are not type-checked, because they may describe APIs newer than the docs pins; the docs pin PR that follows each release keeps maintained guides checked against the released types.

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

Changesets summaries are authored Markdown that becomes MDX. Put prose type syntax such as `Array<Tool>` in code spans so it does not parse as an unclosed JSX element. The production docs build validates the generated entry before release approval.
