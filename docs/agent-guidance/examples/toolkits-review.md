# Toolkits rewrite review

Exercise: `Use docs-page-rewrite to rewrite docs/content/docs/toolkits.mdx as a review example`.

The [proposed page](toolkits.mdx) is outside the published content collections.
The [source page](../../content/docs/toolkits.mdx) is unchanged. This is one
application by the authoring agent, not an independent agent evaluation or a
claim of improved comprehension.

## Sources and choices

Source revision: `d709f79dc` on `next`, inspected 2026-11-23. The source file's
SHA-256 is `744c53f4900e00a25b2e18e56221494cbf60efb351efee6dd948199140723579`.

This is a concept overview for a reader deciding how apps and actions fit into
a session. The rewrite keeps the minimal example early, then explains the
discovery mechanism before the slug lookup table. A sequence diagram shows the
conditional connection step. A new choice section gives the direct-tools
alternative a visible place. There is no lifecycle table because toolkits do
not acquire a lifecycle just to fit this template.

| Original material                                                       | Where it survives                                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Toolkit/tool definitions and app examples                               | Opener and unchanged slug table                                                         |
| Session creation and fetching tools                                     | All three original code fences, byte for byte                                           |
| Default meta tools; omitted `toolkits` permits the catalog              | Expected effect after the example                                                       |
| Discover, connect only if needed, execute                               | Existing ordered list, then diagram and text summary                                    |
| Direct-tools preset                                                     | Choice section; its default helper limitations come from the linked configuration guide |
| Enabling is not authentication                                          | Visible callout before the configuration example                                        |
| Connected account identity, permissions, persistence, multiple accounts | Existing connected-accounts section                                                     |
| Toolkit/tool filters, read-only tags, account permissions               | Existing availability section                                                           |
| Experimental local tools and related concepts                           | Existing links and experimental qualification                                           |
| Frontmatter, outgoing links, five existing section anchors              | Retained; one new heading added                                                         |

Technical cross-checks beyond the target:

- [Session configuration](../../content/docs/configuring-sessions.mdx#direct-tools-preset)
  describes default discovery, toolkit filters, and direct-tools helper limits.
- [TypeScript session tools](../../../ts/packages/core/src/models/ToolRouterSession.ts)
  and [tool retrieval](../../../ts/packages/core/src/models/Tools.ts) fetch the
  server's session tools and format them for the provider. The Python
  [session implementation](../../../python/composio/core/models/tool_router_session.py)
  provides the corresponding `tools()` operation.
- The committed [v3.1 OpenAPI contract](../../public/openapi.json) supplies the
  session creation and tools endpoints used in the unchanged curl example.

## Validation and limits

Both repository skill validators and the skill-creator frontmatter validator
passed. A focused preservation check compared frontmatter, original heading
names, outgoing link occurrences, the complete slug table, and the three
original SDK/API fences. Local resource links resolved.

The example compiled with `@mdx-js/mdx` and the existing `remarkMdxMermaid`
plugin. The repo's `checkCodeExamples` and `checkApiSnippets` functions were
called directly with this sample: language-tab structure and curl contract
checks passed. This explicit invocation matters because normal maintained-page
scans do not include `agent-guidance/examples/`.

The diagram has `accTitle`, `accDescr`, and an adjacent text summary. Standalone
Mermaid parsing in Bun failed because DOMPurify requires a browser DOM. No
browser render, responsive/accessibility audit, full docs build, live API
execution, or SDK type/runtime check was performed. Compilation and unchanged
snippets do not establish those results. Review the complete diff and rendered
page before promoting this example into published docs.
