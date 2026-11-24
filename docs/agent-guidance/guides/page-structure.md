# Structure a docs page

Use `docs-page-rewrite` to reorganize an existing page. Keep the house voice
in `good-docs-writing`. For a concept or overview, explain why the feature
matters to you, then how it works with a diagram, then add detail progressively.
Keep the overview short and move deeper explanations to linked sub-pages.

## Start with the reader's job

Choose one primary purpose before adapting the matching outline in the
[template](../templates/docs-page.md). Split and link when a section serves a
different reader task. The outlines are slots to edit or delete, not mandatory
headings. The overview's why-first order does not apply to every page type.

| Page type           | Useful progression                                                                              | Usually omit or link elsewhere                |
| ------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Concept or overview | Why it matters to you, how it works with a diagram, essential details, links to deeper pages    | Exhaustive setup and parameter reference      |
| How-to              | Outcome, prerequisites, shortest verified path, expected result, conditional branches, recovery | Long conceptual motivation                    |
| Tutorial            | What you will build, setup, incremental steps with visible results, next experiment             | Exhaustive options and unrelated alternatives |
| Reference           | Scope and version, contract tables, small usage example, edge cases, related specification      | Narrative walkthrough and repeated motivation |

Explain an alternative only when choosing between approaches matters. In an
overview, a short mechanism list can precede a diagram. A how-to usually needs
the action first. A lifecycle table belongs only where there are real states
to look up. Split implementation by audience only when those readers have
different responsibilities. Do not manufacture client/server sections.

## Order an overview: why, then how, then details

Use this order when adapting the template for a concept or overview:

1. Start with why the feature or detail matters to you. Name the problem you
   face, what the feature lets you do, and why that outcome is useful. Explain
   the need before introducing the mechanism, setup, or API names. A concrete
   use case helps make the benefit clear.
2. Explain how it works. Introduce the main actors and their actions, then
   place a focused diagram beside that explanation. Show the flow that
   connects the feature to the benefit you just described. Follow with a
   minimal verified example when it helps make the mechanism concrete.
3. Add only the details needed to understand the feature and choose the next
   step. Put the common case before options and exceptions. Link to sub-pages
   for setup, full examples, advanced behavior, and parameter reference. Keep
   constraints that affect the reader's choice beside the relevant claim.

The [MCP Events overview](https://modelcontextprotocol.io/extensions/events/overview)
is a reference for explaining the need before the mechanism. Follow that
progression, rather than copying every section into a Composio overview.
Use headings specific to the feature. Literal "Why" and "How" headings are
optional.

## Pace the page

These are starting points for editing, not measured reference-page properties
or acceptance gates:

- An overview opener of roughly 40–80 words can name the problem, the capability,
  and the useful consequence. A task page states the outcome, and a reference
  states the scope. Move setup details into prerequisites on task pages.
- Most paragraphs work well at 1–3 sentences, about 25–70 words. Split when
  the subject changes, not to hit a count.
- A section often needs 80–200 words or one compact example plus its
  explanation. A section approaching 300 words merits a check for a second
  reader question, a table, or a linked detail page.
- Keep an overview to a few focused sections that explain the need, the
  mechanism, and the next step. Prefer a short summary with a descriptive link
  when a detail answers a separate implementation or lookup question. Don't
  expand the page to reach a word count or delete a required caveat to shorten it.
- In an overview, place an illustrative example after the why and how when it
  helps explain the mechanism. In how-tos and tutorials, put the shortest
  complete path before optional branches. A reference example stays beside
  the contract it illustrates. Remove repetition before reducing completeness.

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

In an overview, use a diagram to explain how the feature works after establishing
why it matters. Place it just after the first explanation of the mechanism it depicts.
Keep it focused on that question. If it needs tiny labels, split it or link
the detailed view. Use real names and label conditional paths. Don't encode a
distinction only in color. Add a caption or adjacent prose that states the
takeaway. All required facts must remain available without seeing the image.
Use Mermaid `accTitle` and `accDescr` where supported, plus the prose summary.
Check mobile width, light/dark readability, and exported Markdown when a page
is rendered. Omit a diagram when it adds nothing to the explanation. Other
page types don't need one by default.

Use the registered components in `docs/mdx-components.tsx`: normal Mermaid
fences, `Callout`, `Tabs`/`Tab`, `Steps`/`Step`, and `Accordion`/`Accordions`.
Check nearby authored usage before choosing props. Do not copy the reference's
`theme={null}` fence syntax or add a renderer dependency.

## Keep examples and caveats useful

Task examples show the smallest complete operation that serves the task.
Keep prerequisites, imports, identity, and initialization explicit or clearly
identify their checked hidden setup. Reference fragments and signatures are
valid when their context is explicit. Don't present a fragment as a standalone
runnable program. State the expected result beside an operation example.
Use verified output when available. Otherwise describe the expected shape or
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
