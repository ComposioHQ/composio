# Review checklist for future loops

Use this checklist when running Claude/Codex review loops on docs IA changes.

## Structure

- Is `Sessions` visible before users encounter advanced Auth/Tools/Providers content?
- Does every current section group by user problem, not implementation artifact?
- Are MCP/client/plugin docs discoverable without crowding out SDK/session docs?
- Is every deprecated path inside `/docs/legacy` or clearly labeled as legacy/maintenance?
- Do collapsible areas use folders with `meta.json` and `defaultOpen: false`, not separator strings?

## Task-first content

- Does the page show a working command/code path before definitions?
- Does the first code path use `composio.create(user_id)` and `session.tools()` for new agent builds?
- Are direct APIs (`composio.tools.get`, `composio.tools.execute`, raw schema helpers) only in migration/legacy docs or explicitly deprecated examples?
- Are architecture pages framed as “what happens after the quickstart”, not prerequisites?

## AI-agent comprehension

- Would an AI code generator infer sessions as the default stable abstraction?
- Is session lifecycle consistent: create for task isolation, store/use session IDs for multi-turn, update sessions when config changes?
- Is the Tool Router → Sessions migration clear enough that agents do not keep recommending old beta/router APIs?
- Are auth docs clear that Composio-managed auth/link auth is the default, with custom auth advanced?
- Are trigger docs clear that triggers are event sources independent from sessions?

## Mechanical correctness

- Do all `meta.json` entries resolve to files, folders, separators, `...`, or valid external Markdown links?
- Do all moved routes have redirects?
- Do wildcard redirects preserve `:path*`?
- Do link validator, build, and static navigation tests pass?
- Do renamed/moved folders have titles that will not look current when nested under Legacy?

## Known commands

```bash
cd docs
bun run scripts/validate-links.ts
bun run build
bun test tests/static/
```
