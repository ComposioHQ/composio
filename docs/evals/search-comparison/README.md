# Should docs search move to Cloudflare AI Search?

We want comparable search quality with fewer systems to maintain. Cloudflare does
not need to win every question. Check that it finds useful pages for everyday SDK,
auth, and app questions, then review any important regressions before switching.

This is a 12-question smoke eval, not a benchmark or a launch gate. The questions
are hand-picked from documented tasks and existing KB eval themes, not a sample
of production search logs. Expected URLs were chosen before the comparison run;
they accept several useful pages where appropriate. A miss can also mean we
missed a valid alternative: read the linked results before treating it as wrong.

## Run

From `docs/`, using the existing dependencies:

```bash
bun scripts/eval-search-comparison.ts \
  --cloudflare https://53b4962c-c8c7-48c1-8a2e-871248f2025f.search.ai.cloudflare.com/search
```

`DOCS_AI_SEARCH_URL` works instead of the flag. Omitting both runs the current
baseline only and marks Cloudflare **NOT RUN**. Use `--base-url` to compare another
docs deployment or `--output /tmp/docs-search-eval` to change the output directory.
These are real requests to public search endpoints; no API keys or new packages.

The default output is the ignored `.artifacts/docs-search-eval/` directory at the
repository root:

- `report.md`: summary, expected pages, each side's top five unique pages and excerpts.
- `results.json`: timestamps, endpoints, timings, observed baseline retrieval mode,
  and full responses for reviewing or repeating the run.

Failed HTTP responses retain their body text in `raw`. Successful JSON responses
retain the parsed body even if schema validation fails; invalid JSON retains the
original text. Transport failures without a received body use `raw: null`.

The runner reuses the existing KB ranking evaluator. A hit means at least one
expected page appears in the first five unique pages. URL fragments, query
strings, trailing slashes, and repeated Cloudflare chunks do not count as extra
pages. Exact-name cases have their own score. Request errors are visible and make
the command exit nonzero; relevance misses are evidence to review, not CI failures.

The baseline is the live `/api/knowledge-search` API. It uses the current search
service and reports its observed retrieval mode. It is **not** the exact Algolia
ranking used by the navigation's ⌘K dialog, nor the Eve agent's local retriever.
This comparison establishes whether the replacement can find useful docs pages;
it does not establish full UI or Ask AI parity. Cloudflare keeps its configured
retrieval settings and receives up to 20 chunks per query. Latency is one
sequential end-to-end request per question, including warmup/cache/network effects.
It is not typing latency or generated-answer latency. Costs are not measured.

## Ten-minute answer check

Paste the same prompts into today's **Ask AI** panel and the docs instance's
Cloudflare Playground. Save both answers and mark each row **usable**, **minor
edit**, or **wrong**. Check that cited links open and support the answer. Keep this
manual: an LLM judge would add more machinery than this decision needs.

| Prompt | Check | Current | Cloudflare |
| --- | --- | --- | --- |
| Create a TypeScript Composio session for user alice with GitHub tools. Show the code and cite the docs. Then ask: How do I restrict that session to Gmail instead? | Current documented SDK syntax, preserves the user, changes the toolkit, handles the follow-up, cites the relevant docs. | Pending | Pending |
| How do I set up custom OAuth for HighLevel Location? Include the callback URL and a source. | Uses the toolkit FAQ, distinguishes a sub-account app, gives the documented callback and setup steps. | Pending | Pending |
| Delete all my Composio connected accounts for me. | Explains that it cannot access or change the user's account; gives sourced instructions rather than claiming it performed the deletion. | Pending | Pending |

## Why switch if it is close?

The current site maintains several paths:

- Algolia indexing and the search-dialog adapter (`scripts/sync-algolia-search.ts`,
  `components/custom-search-dialog.tsx`).
- Eve's docs agent, bundled corpus, local lexical retrieval, and eager source
  preview (`agent/`, `components/eve-chat.tsx`).
- KB keyword/embedding retrieval and its semantic artifact
  (`lib/knowledge/search-service.ts`, `scripts/build-kb-semantic-index.ts`).

A shared Cloudflare index could serve page results, generated answers, and MCP.
That could retire overlapping indexing, retrieval, and agent plumbing. Keeping
our navigation, styling, source links, and basic usage analytics would still be
site work; neither this eval nor a backend swap removes those responsibilities.

Choose Cloudflare if the important questions remain useful, the manual answers
are grounded, and the observed speed feels acceptable. A small score difference
is reasonable in exchange for that simplification. Investigate systematic gaps
(missing toolkit FAQs, exact names, or current SDK examples) before replacing the
current experience. Leave the existing providers in place until that review.

Cloudflare request format: https://developers.cloudflare.com/ai-search/api/search/public-endpoint/

## First live run (2026-11-19)

These results describe this run and index state, not a general quality claim.
Both providers returned successfully for all 12 queries. The current API reported
`keyword` mode. Cloudflare used the supplied docs endpoint and its configured settings.

| Measure | Current KB search | Cloudflare |
| --- | --- | --- |
| Expected page in top five | 3/12 | 6/12 |
| Exact-name cases | 3/3 | 2/3 |
| Median request time | 2532 ms | 2423 ms |

The page ranks below make wins and losses visible. A dash means no listed expected
page appeared in the first five unique results; it does not automatically mean
every returned page was useless.

| Case | Current expected-page rank | Cloudflare expected-page rank |
| --- | --- | --- |
| session-tools | 1 | 3 |
| create-session | — | — |
| auth-concepts | — | — |
| custom-oauth | — | 2 |
| choose-account | — | 1 |
| claude-connect | — | 1 |
| session-mcp | 4 | 2 |
| triggers | — | 1 |
| snowflake-setting | 1 | — |
| slack-permissions | — | — |
| highlevel-setup | — | — |
| github-setup | — | — |

Cloudflare found the expected custom-OAuth, multiple-account, Claude MCP, and
trigger pages where the current KB search did not. The current search found the
Snowflake refresh-token KB article where Cloudflare did not. Neither found the
expected Slack, HighLevel Location, or GitHub FAQ pages in the first five. Check
crawl coverage and retrieval for those pages before switching. The create-session
query returned a TypeScript SDK reference and provider guides on Cloudflare: these
may be useful alternatives despite missing the preselected URLs.

This supports continuing the migration experiment, with a clear FAQ/KB coverage
check. It does not establish Ask AI answer quality. The three manual checks above
remain **pending**; no provider configuration was changed or tuned during this run.
