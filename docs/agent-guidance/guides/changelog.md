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

The SDK release workflow generates entries at `docs/content/changelog/` from its selected release plan. Each entry has `sdkRelease` identification, a `sdkReleaseTargets` version map, the selected-version table, and a neutral publication-status link. The table records release targets; package availability comes from the linked request or PR status.

Use code spans for type names in Changesets prose, such as `Array<Tool>`, so MDX does not interpret them as component tags. The release PR's production docs build must pass before approval.

Edit release summaries and migration guidance in the release PR before approving its final head. Repeated generation preserves an existing entry when its selected targets match. Changed targets require an explicit refresh and another approval, so retries cannot silently overwrite reviewed prose.

Generate SDK symbol references from the same frozen SDK checkout with the existing TypeScript and Python reference generators. Commit their ordinary `docs/content/reference/sdk-reference/` outputs in the release PR. Historical changelog fences render independently of current docs SDK pins; maintained guides and examples keep their normal checks and merge after compatible packages are published.

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
