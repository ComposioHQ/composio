# Audit process

## Procedure

1. Read `good-docs-writing` and its `references/style-guide.md`. That shared
   standard owns the rules. This skill owns the review process.
2. Read each target file in full with line numbers. Identify its primary purpose
   and any renderer-supplied headings, checked hidden setup, or reference context.
3. Review the applicable rules below. Distinguish an actual conflict from a
   documented exception or a suggestion that only changes personal preference.
4. Report actionable findings with exact source text and a concrete rewrite.
   Don't require an overview's structure on a how-to, tutorial, reference,
   decision record, or changelog.
5. Stop after the report. Apply changes only when explicitly asked.

## Prioritized checklist

Review against the shared standard, starting with issues that affect meaning
or the reader's task:

1. **Structure.** Check the page's primary purpose. Overviews explain why, then
   how with a diagram, then essential details and links. How-tos lead with the
   task, tutorials with visible results, and references with the contract.
   Flag material that belongs in a linked page for a different reader task.
2. **Warnings and conditions.** Put them before the actions they govern. Keep
   decision-critical permissions, cost, versions, and support limits visible.
3. **Example context.** Task examples include or clearly identify setup and an
   expected result. Allow checked hidden setup and reference fragments when
   their context is explicit. Flag missing context or a misleading claim that
   a fragment is runnable. Don't require signatures to be programs.
4. **Instructions and sentences.** Use one instruction per sentence and one
   thought per sentence. Review long sentences for ambiguity without enforcing
   a word count. Keep sentence lengths varied.
5. **Actors and commands.** Prefer active voice and direct commands. Address the
   reader as "you". Name an agent or end user when they are a different actor.
6. **Ambiguity.** Check pronoun antecedents, the position of "only" and "not",
   noun strings, articles, verbs, and ambiguous alternatives. Keep one name per
   concept and one verb per action.
7. **Terminology.** Use public Composio names and exact identifiers. Define
   unfamiliar terms. Don't import Modal API patterns or capitalize generic
   nouns as if they were product names.
8. **Filler and figurative language.** Cut vague intensifiers, redundant hedges,
   ceremonial transitions, analogies, metaphors, and rhetorical hooks. Replace
   praise and claims of ease with concrete behavior.
9. **Heading case and hierarchy.** Require sentence case for authored headings,
   preserving product names and identifiers. Count renderer-supplied headings.
   Changelog content beginning at `h3` is an intentional exception in source.
10. **Punctuation.** Replace em dashes with periods or commas, not substitute
    dashes or parentheses. Colons introduce lists or examples. Parentheses
    contain grammatical parenthetical information. Preserve literal syntax.
11. **Formatting and links.** Backtick code identifiers, commands, parameters,
    paths, and filenames. Use bold for UI labels and descriptive link text.
    Follow the repository formatter rather than upstream's tab requirement.

The separate docs correctness reviewer focuses on whether readers would get
stuck or be misled. A style audit can report writing issues outside that scope.
Don't change correctness-review approval rules to enforce every style preference.

## Report format

Start with the scope and a short assessment. Group findings by severity:

- High findings change meaning, hide required conditions, or obstruct the task.
- Medium findings affect clarity or consistency.
- Low findings are localized writing or formatting issues.

Each finding includes a path and line, a category from the shared standard,
the exact offending text, and a suggested rewrite. For example:

```text
- guide.md:42 · [Voice] Vague claim
  Offending: "Composio makes tool discovery seamlessly easy."
  Rewrite:   "Your agent searches for tools with `COMPOSIO_SEARCH_TOOLS`."
```

End with recurring patterns only when they help explain multiple findings.
If the text already matches the standard, say so. Don't invent violations or
edit by default.
