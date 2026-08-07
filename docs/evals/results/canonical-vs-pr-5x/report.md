# Composio docs before/after benchmark

- Before: https://docs.composio.dev
- After: https://docs-r3jken0w3.preview.composio.dev
- Scenarios: 30
- Trials per target: 5
- Model scenario executions: 300

- Before runtime: inception/mercury-2 @ 13cba53b1d1d88eb9f54b740735fcd33534e0eb5
- After runtime: inception/mercury-2 @ f4267abae0615f0855ef9e9ab05f68948c4da8a3

## Model scores

| Dimension | Before | After | Delta |
| --- | ---: | ---: | ---: |
| execution | 100.0% | 100.0% | 0.0% |
| content | 92.0% | 96.7% | 4.7% |
| route | 88.0% | 90.7% | 2.7% |
| citation | 89.7% | 91.0% | 1.4% |
| efficiency | 98.7% | 100.0% | 1.3% |
| overall | 93.7% | 95.7% | 2.0% |
| average tool calls | 0.31 | 0.17 | -0.14 |
| average latency | 1.8s | 1.4s | -0.3s |

## Scenario results

| Scenario | Category | Before | After | Route before/after |
| --- | --- | ---: | ---: | ---: |
| Choose between building and using Composio | start-and-route | 64.0% | 98.0% | 0.0% / 100.0% |
| Start a Python GitHub agent | start-and-route | 100.0% | 100.0% | 100.0% / 100.0% |
| Start a TypeScript application | start-and-route | 96.0% | 100.0% | 100.0% / 100.0% |
| Compare supported frameworks | start-and-route | 80.0% | 96.0% | 100.0% / 100.0% |
| Prefer the Claude Code plugin or CLI | start-and-route | 100.0% | 96.0% | 100.0% / 100.0% |
| Install the Claude Code plugin | start-and-route | 100.0% | 100.0% | 100.0% / 100.0% |
| Use Composio from a terminal | start-and-route | 96.0% | 100.0% | 100.0% / 100.0% |
| Install Composio as an agent skill | start-and-route | 96.0% | 100.0% | 100.0% / 100.0% |
| Prefer CLI or skills for Codex | start-and-route | 88.0% | 76.0% | 40.0% / 0.0% |
| Connect Cursor when MCP is explicit | start-and-route | 96.0% | 96.0% | 100.0% / 100.0% |
| Connect an existing MCP client | start-and-route | 66.0% | 78.0% | 0.0% / 20.0% |
| Expose an application session over MCP | start-and-route | 96.0% | 96.0% | 100.0% / 100.0% |
| Distinguish auth configs and connected accounts | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Bring a custom OAuth app | find-and-change | 96.0% | 88.0% | 100.0% / 100.0% |
| Change OAuth scopes | find-and-change | 100.0% | 96.0% | 100.0% / 100.0% |
| Manage multiple connected accounts | find-and-change | 98.0% | 100.0% | 100.0% / 100.0% |
| Limit tools in a session | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Create a trigger | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Subscribe to trigger events | find-and-change | 100.0% | 96.0% | 100.0% / 100.0% |
| Choose a sandbox | find-and-change | 92.0% | 100.0% | 100.0% / 100.0% |
| Add a custom tool or toolkit | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Call an authenticated app API | find-and-change | 92.0% | 98.0% | 100.0% / 100.0% |
| Migrate direct execution to sessions | find-and-change | 96.0% | 96.0% | 100.0% / 100.0% |
| Migrate old MCP servers to sessions | find-and-change | 100.0% | 100.0% | 100.0% / 100.0% |
| Build the standup Slack bot example | build-examples | 96.0% | 96.0% | 100.0% / 100.0% |
| Build the local PR reviewer example | build-examples | 100.0% | 100.0% | 100.0% / 100.0% |
| Build the iMessage agent example | build-examples | 88.0% | 92.0% | 100.0% / 100.0% |
| Start with LangChain directly | build-examples | 96.0% | 98.0% | 100.0% / 100.0% |
| Find legacy direct execution when explicitly requested | legacy-and-safety | 80.0% | 76.0% | 0.0% / 0.0% |
| Refuse account and billing actions | legacy-and-safety | 100.0% | 100.0% | 100.0% / 100.0% |

## Crawl, corpus, and navigation audit

Navigation depth is calculated from links in page content Markdown, excluding the global sidebar.

| Metric | Before | After |
| --- | ---: | ---: |
| scenario route availability | 100.0% | 100.0% |
| scenario routes in sitemap | 100.0% | 100.0% |
| scenario routes in llms.txt | 88.9% | 96.3% |
| reachable from Welcome content | 3.7% | 59.3% |
| median content-link depth | 0 | 2 |
| llms-full.txt bytes | 727,254 | 679,830 |
| Quickstart Python syntax | 3/3 | 1/1 |

## Review notes

- Dimension failures across all trials: 73
- Full final answers and failure reasons are in `results.json`.
- The 8-task single-reviewer browser pass is in `human-navigation.md`; the preview reached the intended internal page in 8/8 tasks versus 6/8 on canonical.
- Quickstart live execution is intentionally not run: it needs dedicated credentials and a disposable GitHub target because the documented action mutates external state.
- The same scenarios can be handed to human testers; use route found, completion, time, and wrong turns as the human rubric.
