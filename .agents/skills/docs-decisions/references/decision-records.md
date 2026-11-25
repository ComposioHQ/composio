# Decision records

## Location

Use `docs/decisions/` for docs decisions and long-running docs plans. Read `docs/decisions/README.md` before adding or editing records.

## Style

- State the decision first.
- Apply `good-docs-writing` for prose and sentence case. Keep this decision-first
  format rather than applying an overview's why-first order to a record.
- Include problem context, architecture, operational rules, and follow-up steps.
- Prefer durable product/docs constraints over chat transcripts or implementation diary entries.
- Keep file names lowercase and descriptive.
- Add every new decision record to `docs/decisions/README.md`.

## Template

```markdown
# Decision title

## Decision

State the accepted direction in one or two paragraphs.

## Context

Describe the problem, constraints, and alternatives that matter.

## Consequences

List operational rules, tradeoffs, and follow-up work.

## Verification

Name commands, generated artifacts, or review checks that prove future changes still honor the decision.
```

## Updating existing decisions

When a docs change alters an existing decision:

1. Read the current record.
2. Patch the decision or add a dated note.
3. Update `docs/decisions/README.md`.
4. Verify links with `bun run lint:links` when content links changed.
