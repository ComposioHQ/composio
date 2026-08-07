# Composio docs before/after benchmark

- Before: https://docs.composio.dev
- After: https://docs-git-docs-intent-based-ia.preview.composio.dev
- Scenarios: 31
- Trials per target: 5
- Model scenario executions: 310
- Scoring version: 2

- Before runtime: inception/mercury-2 @ 13cba53b1d1d88eb9f54b740735fcd33534e0eb5
- After runtime: inception/mercury-2 @ a95a67ca621e0240ae46d992e2b2aa85a7b7f487

## Model scores

| Dimension | Before | After | Delta |
| --- | ---: | ---: | ---: |
| execution | 100.0% | 100.0% | 0.0% |
| content | 89.4% | 99.7% | 10.3% |
| route | 80.6% | 97.4% | 16.8% |
| citation | 76.7% | 90.0% | 13.3% |
| efficiency | 97.4% | 100.0% | 2.6% |
| overall | 89.0% | 97.5% | 8.5% |
| average tool calls | 0.47 | 0.17 | -0.30 |
| average latency | 2.6s | 1.6s | -1.0s |

## Scenario results

| Scenario | Category | Before | After | Route before/after |
| --- | --- | ---: | ---: | ---: |
| Choose between building and using Composio | start-and-route | 48.0% | 100.0% | 0.0% / 100.0% |
| Start a Python GitHub agent | start-and-route | 100.0% | 96.0% | 100.0% / 100.0% |
| Start a TypeScript application | start-and-route | 100.0% | 100.0% | 100.0% / 100.0% |
| Compare supported frameworks | start-and-route | 100.0% | 92.0% | 100.0% / 100.0% |
| Prefer the Claude Code plugin or CLI | start-and-route | 100.0% | 96.0% | 100.0% / 100.0% |
| Install the Claude Code plugin | start-and-route | 100.0% | 100.0% | 100.0% / 100.0% |
| Use Composio from a terminal | start-and-route | 96.0% | 100.0% | 100.0% / 100.0% |
| Install Composio as an agent skill | start-and-route | 60.0% | 76.0% | 0.0% / 40.0% |
| Prefer the native plugin for Codex | start-and-route | 52.0% | 100.0% | 0.0% / 100.0% |
| Install the Codex plugin directly | start-and-route | 40.0% | 100.0% | 0.0% / 100.0% |
| Connect Cursor when MCP is explicit | start-and-route | 100.0% | 92.0% | 100.0% / 80.0% |
| Connect an existing MCP client | start-and-route | 50.0% | 100.0% | 0.0% / 100.0% |
| Expose an application session over MCP | start-and-route | 98.0% | 100.0% | 100.0% / 100.0% |
| Distinguish auth configs and connected accounts | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Bring a custom OAuth app | find-and-change | 100.0% | 92.0% | 100.0% / 100.0% |
| Change OAuth scopes | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Manage multiple connected accounts | find-and-change | 90.0% | 100.0% | 100.0% / 100.0% |
| Limit tools in a session | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Create a trigger | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Subscribe to trigger events | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Choose a sandbox | find-and-change | 100.0% | 92.0% | 100.0% / 100.0% |
| Add a custom tool or toolkit | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Call an authenticated app API | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Migrate direct execution to sessions | find-and-change | 96.0% | 100.0% | 100.0% / 100.0% |
| Migrate old MCP servers to sessions | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Build the standup Slack bot example | build-examples | 96.0% | 96.0% | 100.0% / 100.0% |
| Build the local PR reviewer example | build-examples | 100.0% | 100.0% | 100.0% / 100.0% |
| Build the iMessage agent example | build-examples | 96.0% | 92.0% | 100.0% / 100.0% |
| Start with LangChain directly | build-examples | 94.0% | 98.0% | 100.0% / 100.0% |
| Find the exact tools.execute implementation guide | legacy-and-safety | 42.0% | 100.0% | 0.0% / 100.0% |
| Refuse account and billing actions | legacy-and-safety | 100.0% | 100.0% | 100.0% / 100.0% |

## Crawl, corpus, and navigation audit

Navigation depth is calculated from links in page content Markdown, excluding the global sidebar.

| Metric | Before | After |
| --- | ---: | ---: |
| scenario route availability | 96.4% | 100.0% |
| scenario routes in sitemap | 96.4% | 100.0% |
| scenario routes in llms.txt | 85.7% | 96.4% |
| reachable from Welcome content | 3.6% | 60.7% |
| median content-link depth | 0 | 2 |
| llms-full.txt bytes | 727,254 | 683,647 |
| Quickstart Python syntax | 3/3 | 1/1 |

## Review notes

- Dimension failures across all trials: 58
- Full final answers and failure reasons are in `results.json`.
- Quickstart live execution is intentionally not run: it needs dedicated credentials and a disposable GitHub target because the documented action mutates external state.
- The same scenarios can be handed to human testers; use route found, completion, time, and wrong turns as the human rubric.
