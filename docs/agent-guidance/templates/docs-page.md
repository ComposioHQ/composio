# Docs page template

Choose one outline after identifying the page's purpose in the
[structure guide](../guides/page-structure.md). Use `good-docs-writing` for prose.
Delete irrelevant slots and replace bracketed instructions. Preserve the target's
frontmatter and heading IDs. These outlines are authoring instructions, not
pages ready to publish. Use headings specific to the feature or task.

Preserve this frontmatter shape for each outline, using the target's actual
values and any additional required fields:

```mdx
---
title: [Existing title]
description: [Concrete outcome or scope]
---
```

## Concept or overview

```mdx
[Explain why the feature matters to you. Name the problem, the capability,
and the useful consequence. Use a concrete use case before mechanism or setup.]

## [How the feature works]

[Introduce the main actors and their actions.]

[Place a focused diagram here with an accessible title, description, and prose
summary. Use Composio's Mermaid renderer. Omit it only if it adds nothing.]

[Add a small verified example after the mechanism when it helps explain it.
State its context and expected effect. Link full setup and implementation.]

## [Essential details for choosing the next step]

[Common case first, then only the constraints and options needed to understand
the feature. Keep permissions, cost, versions, and support conditions beside
what they qualify. Link separate lookup and implementation questions.]

## [Next action]

[Link the task guide, deeper explanation, or canonical reference.]
```

## How-to

```mdx
[State the task and the outcome. Assume the reader has chosen this approach.]

## [Prerequisites]

[Identify required setup, permissions, accounts, and versions. Link background.]

## [Complete the task]

[Put any warning before the action it guards. Show the shortest verified path.
Use numbered steps when order matters. Include or clearly identify setup for
code examples, and state the expected result beside each operation.]

## [Conditional paths or recovery]

[Conditions first, then actions. Link deeper explanations and full contracts.]
```

## Tutorial

```mdx
[Say what you will build and the visible result.]

## [Set up the example]

[Give the prerequisites and complete starting state.]

## [First working result]

[Give the action and a verified example with setup. State what you should see.
Put warnings before actions. Keep explanation brief and link background.]

## [Next working result]

[Build on the previous state. State the next observable result. Repeat only
as needed for the learning goal. Link reference details instead of adding tables.]

## [Try the next experiment]

[Suggest a specific next action using what you built.]
```

## Reference

```mdx
[State scope and version. Describe the contract without a motivation essay.]

## [Contract]

[Follow the structure of the API or feature being described.]

| [Exact field, option, or state] | Meaning | Default or constraint |
| ------------------------------- | ------- | --------------------- |
| [Verified name]                 | [Fact]  | [Verified condition]  |

## [Usage example]

[Show a small example for this contract when useful. State the context for a
fragment or signature. Link setup and procedures rather than adding a tutorial.]

## [Limits and errors]

[Describe verified constraints, failure behavior, and version or support gates.]

## [Related contract or task]

[Link the canonical specification or the guide that uses this contract.]
```

Decision records and changelogs use their own templates. Existing sections and
anchors can supply these slots without adopting the sample headings. The
[Toolkits page](../../content/docs/toolkits.mdx) demonstrates Composio's diagram
rendering and technical caveats. Its example comes before the mechanism, so use
the overview outline above for section order.
