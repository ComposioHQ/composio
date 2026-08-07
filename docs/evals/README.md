# Documentation evals

The docs benchmark compares the public canonical site with a candidate deployment. It runs the same 31 prompts repeatedly and scores five dimensions independently:

- execution: the docs agent completed without a failed action
- content: the answer contains the scenario's required concepts
- route: it chooses an expected page and avoids explicitly worse routes
- citation: it provides a Markdown link to an expected canonical route
- efficiency: it stays within the scenario's tool-call budget

It also audits `/docs`, Markdown endpoints, `llms.txt`, `llms-full.txt`, the sitemap, content-link navigation depth, and Python syntax in the Quickstart.

## Run a before/after benchmark

From `docs/`:

```bash
bun run eval:docs:benchmark -- \
  --before https://docs.composio.dev \
  --after https://your-preview.preview.composio.dev \
  --trials 5 \
  --output evals/results/latest
```

Use one trial while editing, then 5 to 10 trials for a comparison. Outputs are `report.md` for review and `results.json` for per-trial answers and scores.

Run only the scenarios affected by an iteration while editing:

```bash
bun run eval:docs:benchmark -- \
  --before https://docs.composio.dev \
  --after https://your-preview.preview.composio.dev \
  --scenarios codex-without-mcp,generic-mcp-client,application-session-mcp \
  --trials 10 \
  --skip-site-audit \
  --output evals/results/focused
```

`--scenarios` accepts comma-separated scenario IDs. Run the full suite once the focused routes are stable.

Regrade saved answers after adjusting deterministic route, content, or citation rules without making new model calls:

```bash
bun run eval:docs:benchmark -- \
  --from-results evals/results/latest/results.json \
  --output evals/results/latest
```

Reports record a scoring version so regraded artifacts remain reviewable when the deterministic rubric changes.

Run only deterministic crawl, corpus, navigation, and Quickstart syntax checks:

```bash
bun run eval:docs:benchmark -- \
  --after https://your-preview.preview.composio.dev \
  --site-only \
  --output evals/results/site-only
```

## Human navigation pass

Use the same scenario prompts without showing participants the expected routes. Record whether they reached a useful page, completion time, wrong turns, and confidence. Sample at least these tasks from different categories:

1. Start a Python GitHub agent.
2. Set up Claude Code without mentioning MCP.
3. Change OAuth scopes.
4. Limit the tools available in a session.
5. Subscribe to trigger events.
6. Build the local PR reviewer example.
7. Find legacy direct execution only after asking for it explicitly.

The automated navigation score is a content-link graph proxy, not a replacement for this moderated pass.

## Quickstart execution

The default audit compiles every Python block without importing packages or calling external services. A live smoke test should run the interactive agent with dedicated credentials, verify that a read-only task reaches tool discovery, and verify that a task requiring authentication returns a Connect Link. Keep connected-account flows and any write action opt-in; use a disposable account and target when testing consequential tools.

## CI shape

Start with a manually dispatched workflow that receives the preview URL, runs one trial plus the deterministic audit, and uploads `evals/results/` and `.eve/evals/`. Add a scheduled 5-trial canonical comparison after model credentials and spend limits are approved. Do not make stochastic content scores merge-blocking until repeated-run variance is known; route availability, corpus coverage, and Quickstart syntax can be blocking immediately.
