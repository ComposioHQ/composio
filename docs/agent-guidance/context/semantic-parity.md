# Check semantic parity

The parity suite checks that task instructions survive page rendering, corpus assembly, and search ingestion. Run these commands from `docs/`:

```bash
bun test tests/static/semantic-parity.test.ts
bun run build
bun run start
```

With the server running, use another terminal:

```bash
bun test tests/integration/semantic-parity.test.ts
```

Set `TEST_BASE_URL` to check a deployed site. The standard docs CI already runs both test directories against a production build.

## Coverage

`tests/fixtures/semantic-parity.ts` defines the same expected facts for all checks. It covers the product chooser, quickstart, Anthropic provider, For You plugins, coding-agent setup, and current and legacy REST tools pages. Expectations include complete installation commands, package selection rules, warnings, executable statements, and versioned endpoints from the [component audit](./markdown-components.md).

The static suite checks the complete search replacement payload after chunking. The HTTP suite checks actual page Markdown and each page's section in `/llms-full.txt`. A fact on another page cannot satisfy the assertion. Legacy REST pages are checked individually and in search, including their legacy classification. The current full corpus must exclude them.

Failures name the page, fact ID, and output that lost it. Mutation checks remove each expected fact and verify that its assertion fails. Review the source instructions before changing an expectation. Do not regenerate expectations from converter output.

## Check an external export

Export retrieved text or indexed records into this JSON shape. Include all fixture pages, with each page's chunks in source order:

```json
{
  "surface": "Context7 export",
  "capturedAt": "2026-09-11T00:00:00Z",
  "includesLegacy": false,
  "pages": [
    { "url": "/docs/quickstart", "content": "Full retrieved page text goes here." }
  ]
}
```

This abbreviated example fails because it omits pages and facts. Set `includesLegacy` to `true` for indexes that include legacy REST pages, such as the Algolia replacement payload. URLs can be site paths or canonical `docs.composio.dev` URLs, including Markdown suffixes and section anchors.

```bash
bun scripts/check-docs-parity.ts /tmp/docs-export.json
```

The checker validates the JSON, groups chunks by page, and runs the shared expectations. Missing pages or facts return a nonzero exit status. Preserve the provider name and capture timestamp when recording results. Local tests prove the ingestion payload retains facts; they do not prove that an external service refreshed its index. External captures remain a separate check because PR CI has no external retrieval credentials.

These assertions check content preservation. They do not measure retrieval ranking or agent task completion, which belong to DEVREL-37.
