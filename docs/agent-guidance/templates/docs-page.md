# Docs page template

Adapt this scaffold after choosing a page type in the
[structure guide](../guides/page-structure.md). Delete irrelevant slots and
replace bracketed instructions. Preserve the target's frontmatter and heading
IDs. This is an authoring template, not a page ready to publish.

```mdx
---
title: [Existing title]
description: [Concrete outcome or scope]
---

[Name the problem and what this capability lets you do. Define only the terms
needed for the first example. State gating prerequisites before the action.]

[Place the smallest verified example here, with its setup and expected effect.
Reuse the target's language tabs. For a how-to or tutorial this may be step 1.]

## [Why choose this approach?]

[For a decision or overview: explain the relevant alternative and its costs.
Delete when the reader has already chosen or the page is reference-only.]

## [How the mechanism works, or the task to complete]

1. [Actor, action, and result. Use ordered steps only when order matters.]
2. [Next action, including any required condition.]

[Optional diagram here if it adds relationships or timing that prose obscures.
Use the existing Mermaid renderer. Include an accessible title/description
and a plain-text summary. Do not invent actors, states, or branches.]

## [Where this fits]

[Explain relevant use cases and boundaries, or link to a comparison page.
For a how-to, this may instead be conditional paths after the successful path.]

## [Details readers need to look up]

| [Verified concept, option, or state] | Meaning               | [Condition, if useful] |
| ------------------------------------ | --------------------- | ---------------------- |
| [Exact name]                         | [Observable behavior] | [Verified condition]   |

[Delete the table when there is no lookup task. Explain invariants in prose.]

## [Implement or configure the next step]

[Keep this section only if the page promises implementation. Group by actual
task or responsibility. Reuse an earlier example instead of repeating setup.
Place small verified snippets and their expected effects beside each action.]

## [Optional behavior or recovery]

[Default behavior first, then the option and its tradeoff. Keep required
caveats visible. Link long procedures instead of hiding them in this page.]

## [Support and limits]

[Collect remaining verified constraints. Keep action-specific warnings beside
the action too. Do not add a section just to say that support might vary.]

## [Next action or canonical reference]

[Descriptive links to the next task, detailed API contract, or specification.]
```

For a reference page, move the lookup details ahead of the mechanism. For a
how-to or tutorial, keep steps and visible results together and move background
to links. Existing sections and anchors can supply the slots without adopting
these headings. See the [Toolkits page](../../content/docs/toolkits.mdx) for an
overview that uses a sequence diagram and omits a lifecycle table.
