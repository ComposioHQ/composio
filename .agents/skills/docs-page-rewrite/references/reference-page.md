# Reference observations

## Events: motivation before mechanism

The [MCP Events overview](https://modelcontextprotocol.io/extensions/events/overview)
is the primary reference for explaining why a capability matters before how it
works. Inspected on 2026-11-24, it explains the need for agents to react to
upstream activity, describes gaps in existing notifications, then introduces
the event flow. Use that order of reader questions for Composio overviews.

The diagram placement rule comes from Composio's structure guide. It is not a
claim that the Events page has a diagram. Keep deeper setup and contract details
on linked Composio pages instead of copying all of the upstream sections.

## Tasks: diagram and table placement

Tasks is a secondary reference for representations within an explanation.
The following capture was inspected on 2026-11-23:

- [MCP Tasks page](https://modelcontextprotocol.io/extensions/tasks/overview)
- [Markdown export](https://modelcontextprotocol.io/extensions/tasks/overview.md)

Capture fingerprints, SHA-256 of response bytes:

| Response | Bytes  | SHA-256                                                            |
| -------- | ------ | ------------------------------------------------------------------ |
| HTML     | 198396 | `1e1b0dad9b617563df2fe192bb6bc78d542a03bba0bb0bf70dcd47eba4c0b079` |
| Markdown | 9717   | `f44586bdca128f2421fdda9832423f0e85cd2b0ca964d49276ba7c8e005064ed` |

Measured from Markdown: eight second-level sections, two third-level sections,
one 25-line sequence diagram, and two JSONC examples of 16 and 12 lines.
A rough whitespace-based word count is 1,244 including code and export
furniture, or 1,119 after removing fenced blocks. These are rough size observations,
not a reading-time estimate or targets.

The progression is problem and alternative costs, ordered mechanism, diagram,
fit, status meanings, optional notifications, implementation by audience,
support caveat, and specification links. The lifecycle table answers a lookup
question separately from the temporal diagram. Small configuration examples
sit beside the steps they support.

HTML source has a main prose column, a separate linked contents rail, and
responsive width classes. Its embedded compiled MDX includes `Card`, `Mermaid`,
and `Step` components. HTML text extraction omits the sequence diagram. The
Markdown and embedded source retain it. This was source inspection, not a
browser measurement of pixels, typography, or mobile rendering.

Use these observations for diagram and table placement, not as a required
section list or a length target. Composio's template uses its own renderer
rather than copying Mintlify markup. Suggested lengths in the structure guide
are editorial defaults, not measurements of this page. These observations do
not assume that the upstream page still has this shape.

## Toolkits: Composio rendering and technical preservation

The [Toolkits page](../../../../docs/content/docs/toolkits.mdx) demonstrates
Composio's Mermaid rendering, accessible diagram summary, language tabs, and
technical caveats. Its code example precedes the mechanism, so it is not the
model for the overview order. Use the structure guide's why, how, and essential
details progression when adapting an overview.
