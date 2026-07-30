# Changelog Guide

## File Naming

```
MM-DD-YY.mdx              # e.g., 12-29-25.mdx
MM-DD-YY-suffix.mdx       # Multiple same day: 12-10-25-masking.mdx
```

## Template

```mdx
---
title: 'Your Title Here'
date: 'YYYY-MM-DD'
---

Brief intro paragraph.

### SDK Versions (if applicable)

| SDK                         | Version  |
| --------------------------- | -------- |
| Python `composio`           | `0.10.2` |
| TypeScript `@composio/core` | `0.3.1`  |

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

## Rules

1. **Frontmatter required** — `title` and `date` (YYYY-MM-DD format)
2. **No `#` heading** — Title renders automatically from frontmatter
3. **Use `###` for sections** — Content headings start at h3
4. **No emojis** — No checkmarks, warning symbols, etc.

Manually authored entries merged to `next` publish to the docs site, but they no
longer trigger the Slack notification or the changelog-to-docs pull request.
Those follow-ups require a coordinator finalization PR carrying the manifest
marker described below.

## SDK Release Drafts

The SDK release coordinator generates review drafts under
`.github/sdk-release/drafts/<release_id>.mdx`. These files are outside the
Fumadocs changelog collection and are not public.

The model returns only source-cited facts. Deterministic release code owns
frontmatter, the released-version table, section order, MDX escaping, and both
draft and final filenames. Reviewers may edit a draft in the preparation pull
request; ordinary retries must preserve those edits. A reset is explicit and
invalidates the earlier review.

Only after every selected package is verified in its registry may finalization
copy the exact reviewed draft bytes into `docs/content/changelog/`. Do not move,
rename, or hand-publish a coordinator draft before that receipt exists.

Finalization uses one stable `release/sdk-<release_id>-changelog` pull request.
The finalizer verifies the receipt, manifest ID, complete package observations,
reviewed SHA-256, frontmatter, and released-version table before copying bytes.
If the date's unsuffixed filename already belongs to another entry, it allocates
the release-ID suffix deterministically. Exact merged content is a no-op;
conflicting content fails for operator review.

The changelog-to-docs and customer notification workflows accept only a merged
finalization PR carrying the exact manifest marker. Each workflow claims its own
manifest-keyed marker on that PR before emitting, so workflow retries, draft
merges, and receipt-only retries do not create duplicate downstream work.

## Change Types

| Type            | How to Format                                                 |
| --------------- | ------------------------------------------------------------- |
| Breaking Change | `<Callout type="warn">` + before/after code + migration guide |
| New Feature     | `### What's New`                                              |
| Improvement     | `### Improvements`                                            |
| Bug Fix         | `### Bug Fixes`                                               |
| Deprecation     | `<Callout>` with timeline                                     |

## Breaking Changes Checklist

For any breaking change, include:

- [ ] Before/after code examples
- [ ] Migration guide with step-by-step instructions
- [ ] Codemod (if applicable) — automated script to transform old code to new

**What's a codemod?** A script that automatically updates user code. Instead of "change X to Y manually", users run the codemod and it transforms their code. See [jscodeshift](https://github.com/facebook/jscodeshift) or [ts-morph](https://github.com/dsherret/ts-morph).
