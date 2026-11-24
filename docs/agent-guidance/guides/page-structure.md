# Structure a docs page

Use `docs-page-rewrite` to reorganize an existing page. Keep the house voice
in `good-docs-writing`. This guide covers what each part of the page does,
how much space it needs, and when a different representation helps.

## Start with the reader's job

Choose the page's primary purpose before adapting the
[template](../templates/docs-page.md). The template is a set of slots to edit
or delete, not mandatory headings.

| Page type           | Useful progression                                                                              | Usually omit or link elsewhere                |
| ------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Concept or overview | Problem and benefit, early concrete example, mechanism, fit and tradeoffs, details, next action | Exhaustive setup and parameter reference      |
| How-to              | Outcome, prerequisites, shortest verified path, expected result, conditional branches, recovery | Long conceptual motivation                    |
| Tutorial            | What you will build, setup, incremental steps with visible results, next experiment             | Exhaustive options and unrelated alternatives |
| Reference           | Scope and version, contract tables, small usage example, edge cases, related specification      | Narrative walkthrough and repeated motivation |

Explain an alternative only when choosing between approaches matters. In an
overview, a short mechanism list can precede a diagram. A how-to usually needs
the action first. A lifecycle table belongs only where there are real states
to look up. Split implementation by audience only when those readers have
different responsibilities. Do not manufacture client/server sections.

## Pace the page

These are starting points for editing, not measured reference-page properties
or acceptance gates:

- An opener of roughly 40–80 words should name the problem, the capability,
  and the useful consequence. Move setup details into prerequisites.
- Most paragraphs work well at 1–3 sentences, about 25–70 words. Split when
  the subject changes, not to hit a count.
- A section often needs 80–200 words or one compact example plus its
  explanation. A section approaching 300 words merits a check for a second
  reader question, a table, or a linked detail page.
- For an overview, roughly 600–1,200 words of prose can be a useful first
  editing budget. A narrow reference may be much shorter. A complete tutorial
  may be longer. Count one selected language path separately from all tabs;
  never delete a contract or caveat to meet a budget.
- Keep a minimal verified example near the top. For long procedures, expose
  the successful path before optional branches. Remove repeated explanations
  before reducing example completeness.

Use the existing content width and heading hierarchy. Change content density
through shorter blocks and useful representations, not custom CSS, font sizes,
or new components.

## Choose the representation

| Reader question                               | Representation                                |
| --------------------------------------------- | --------------------------------------------- |
| Who exchanges what, and in what order?        | Sequence diagram                              |
| Which branch applies, or where does data go?  | Flowchart                                     |
| Which transitions are allowed?                | State diagram, only from a verified lifecycle |
| What does each status, field, or option mean? | Table                                         |
| What do I do next?                            | Numbered steps with an observable result      |

Place a diagram just after the first explanation of the mechanism it depicts.
Keep it focused on that question. If it needs tiny labels, split it or link
the detailed view. Use real names and label conditional paths. Don't encode a
distinction only in color. Add a caption or adjacent prose that states the
takeaway; all required facts must remain available without seeing the image.
Use Mermaid `accTitle` and `accDescr` where supported, plus the prose summary.
Check mobile width, light/dark readability, and exported Markdown when a page
is rendered. A diagram is optional; there is no diagram or example quota.

Use the registered components in `docs/mdx-components.tsx`: normal Mermaid
fences, `Callout`, `Tabs`/`Tab`, `Steps`/`Step`, and `Accordion`/`Accordions`.
Check nearby authored usage before choosing props. Do not copy the reference's
`theme={null}` fence syntax or add a renderer dependency.

## Keep examples and caveats useful

Show the smallest complete operation that demonstrates the section's point.
Keep prerequisites, imports, identity, and initialization explicit or in the
existing checked hidden setup. State the expected result beside the example.
Use verified output when available; otherwise describe the expected shape or
effect without fabricating a transcript. Label illustrative data as such.

Follow [code example coverage](../context/code-examples.md) and
[Twoslash guidance](../context/twoslash.md) for SDK/API options and verification.
An unchanged example is evidence of preservation, not proof it runs today.

Keep the default path visible. Use accordions for optional advanced detail,
tabs for equivalent alternatives, and links for full contracts. Put a warning
before the action it guards. Keep auth, cost, permission, version, and support
conditions beside the relevant claim or step, even when a later limitations
section collects them. Don't hide a required caveat in collapsed content.

Finish with specific next actions or canonical references. Preserve incoming
anchors, outgoing links, and frontmatter. Report any technical uncertainty
outside the proposed page rather than smoothing it into confident prose.
