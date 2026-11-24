# Reference observations

Inspected on 2026-11-23:

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
and `Step` components. HTML text extraction omits the sequence diagram; the
Markdown and embedded source retain it. This was source inspection, not a
browser measurement of pixels, typography, or mobile rendering.

The reusable idea is the progression of reader questions and changes of
representation. The following template uses Composio's renderer rather than
copying Mintlify markup. All suggested lengths in the structure guide are
editorial defaults, not measurements of this page. Future agents can use
these observations without assuming the upstream page still has this shape.
