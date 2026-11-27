# Changelog guide

## File naming

```
MM-DD-YY.mdx              # For example, 12-29-25.mdx
MM-DD-YY-suffix.mdx       # Multiple entries on one day: 12-10-25-masking.mdx
```

## Template

```mdx
---
title: 'Your title here'
date: 'YYYY-MM-DD'
---

Brief intro paragraph.

### SDK versions (if applicable)

| SDK                         | Version  |
| --------------------------- | -------- |
| Python `composio`           | `0.10.2` |
| TypeScript `@composio/core` | `0.3.1`  |

### Breaking changes (if applicable)

<Callout type="warn">
**Breaking change**

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

### [Choose a section: What's new, Improvements, or Bug fixes]

- Change 1
- Change 2
```

Use the released version in the final table column. The Python release guard reads that column from rows labelled `Python \`composio\``.

## SDK release entries

The SDK release workflow writes one entry per release to `docs/content/changelog/`, with `sdkRelease` and `sdkReleaseTargets` frontmatter, the version table, the changeset summaries, and a link to the request issue. Its prose comes from the changesets: to change it, fix the changesets on `next` and request a new release. Do not hand-edit generated entries in the release PR.

The release PR also regenerates `docs/content/reference/sdk-reference/` from the released source. Changelog code fences are not type-checked, because they may describe APIs newer than the docs pins. The docs pin PR that follows each release keeps maintained guides checked against the released types.

## Rules

Use `good-docs-writing` for prose and sentence case. Keep this release-summary
format instead of an overview's why-first structure.

- Include `title` and `date` frontmatter. Use `YYYY-MM-DD` for dates.
- Omit a Markdown `#` heading. The renderer supplies the page title and each
  entry's `h2` title from frontmatter, so content sections begin at `h3`.
  This source-level exception preserves the rendered heading hierarchy.
- Use sentence case for section headings, preserving product names and identifiers.
- Put warnings before the commands or examples they govern.
- Omit decorative emojis, including checkmarks and warning symbols.

## Change types

| Type            | Format                                                                           |
| --------------- | -------------------------------------------------------------------------------- |
| Breaking change | `<Callout type="warn">`, code before and after the change, and a migration guide |
| New feature     | `### What's new`                                                                 |
| Improvement     | `### Improvements`                                                               |
| Bug fix         | `### Bug fixes`                                                                  |
| Deprecation     | `<Callout>` with timeline                                                        |

## Breaking changes checklist

For any breaking change, include:

- [ ] Code examples before and after the change
- [ ] Migration guide with step-by-step instructions
- [ ] A codemod when an automated migration is available

A codemod is a script that updates source code for a migration. See [jscodeshift](https://github.com/facebook/jscodeshift) or [ts-morph](https://github.com/dsherret/ts-morph).

Changesets summaries are authored Markdown that becomes MDX. Put prose type syntax such as `Array<Tool>` in code spans so it does not parse as an unclosed JSX element. The production docs build validates the generated entry before release approval.
