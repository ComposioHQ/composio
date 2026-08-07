# Human-style navigation pass

This is a single-reviewer browser pass, not a moderated usability study. Each task started on `/docs`; the reviewer used only visible links and disclosure controls, without search or the docs agent.

| Task | Canonical | Preview | Observation |
| --- | ---: | ---: | --- |
| Start a Python GitHub agent | 1 click | 1 click | Both reach Quickstart; the preview labels the path “Python quickstart” and states the GitHub outcome. |
| Set up Claude Code without asking for MCP | 1 click to CLI | 1 click to plugin | The preview exposes the preferred plugin directly, but visually lists generic MCP before both CLI and plugin. |
| Connect an existing client after explicitly asking for MCP | No direct docs link | 1 click | The preview adds a direct Composio Connect path; canonical points toward a separate “For You” surface or the application-session MCP guide. |
| Change OAuth scopes | 1 click | 2 clicks | The preview requires Authentication, then Control OAuth scopes. The grouping is understandable but adds an interaction. |
| Limit tools in a session | 1 click | 1 click | Configuring Sessions is directly visible on both. |
| Subscribe to trigger events | 1 click | 2 interactions | The preview requires expanding Set up triggers before choosing Receiving events. |
| Find the local PR reviewer example | 2 clicks | 2 clicks | Both use Examples, then the named example card. |
| Find legacy direct execution after explicitly requesting it | 2 interactions | 2 interactions | Both keep the legacy page behind a disclosure, which is the desired progressive behavior. |

## Result

- Canonical: 6 of 8 tasks reached the intended internal page through visible navigation; one used CLI as the acceptable Claude Code path, and explicit Composio Connect was not directly exposed.
- Preview: 8 of 8 tasks reached the intended internal page.
- Main remaining hierarchy issue: under “Use Composio,” put plugin/CLI choices before generic MCP while keeping MCP easy to find when the user explicitly asks for it.

